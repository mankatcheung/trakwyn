import { browser } from 'wxt/browser';
import { OAuthCancelledError } from './oauth';
import { STORAGE_KEYS } from '../constants';

/**
 * OAuth sign-in in a tab, for browsers without `identity.launchWebAuthFlow`
 * (Safari, JEF-386).
 *
 * The API ends the login on a fixed page on its own origin (`doneUrl`) with the
 * handoff code in the query. This module watches the sign-in tab until it lands
 * there, closes it, and hands back the URL. The code is useless without this
 * login's PKCE verifier, so a page that sees the URL can't redeem it.
 *
 * Safari may unload the background page while the user is signing in. So the
 * login is also kept in `storage.session`, and the listeners are registered
 * when the background script starts (see `registerTabOAuthListeners`). A
 * restarted background can then finish the login even though the in-memory
 * waiter is gone.
 */

export interface PendingTabOAuth {
  tabId: number;
  verifier: string;
  doneUrl: string;
}

interface Waiter {
  doneUrl: string;
  resolve: (redirectUrl: string) => void;
  reject: (err: Error) => void;
}

/** Logins started by this background instance, by sign-in tab ID. */
const waiters = new Map<number, Waiter>();

function isPendingTabOAuth(value: unknown): value is PendingTabOAuth {
  const pending = value as Partial<PendingTabOAuth> | undefined;
  return (
    typeof pending?.tabId === 'number' &&
    typeof pending.verifier === 'string' &&
    typeof pending.doneUrl === 'string'
  );
}

async function loadPending(): Promise<PendingTabOAuth | null> {
  const result = await browser.storage.session.get(STORAGE_KEYS.PENDING_TAB_OAUTH);
  const pending: unknown = result[STORAGE_KEYS.PENDING_TAB_OAUTH];
  return isPendingTabOAuth(pending) ? pending : null;
}

async function clearPending(): Promise<void> {
  await browser.storage.session.remove(STORAGE_KEYS.PENDING_TAB_OAUTH);
}

/** Same origin and path as `doneUrl`; the query carries the code or error. */
export function isDoneUrl(url: string, doneUrl: string): boolean {
  try {
    const actual = new URL(url);
    const expected = new URL(doneUrl);
    return actual.origin === expected.origin && actual.pathname === expected.pathname;
  } catch {
    return false;
  }
}

/**
 * Opens `startUrl` in a tab and resolves with the URL it ends on. Rejects with
 * `OAuthCancelledError` if the user closes the tab first.
 */
export async function runTabOAuth(
  startUrl: string,
  doneUrl: string,
  verifier: string,
): Promise<string> {
  const tab = await browser.tabs.create({ url: startUrl });
  const tabId = tab.id;
  if (tabId === undefined) throw new Error("Couldn't open the sign-in tab.");

  const redirect = new Promise<string>((resolve, reject) => {
    waiters.set(tabId, { doneUrl, resolve, reject });
  });
  await browser.storage.session.set({
    [STORAGE_KEYS.PENDING_TAB_OAUTH]: { tabId, verifier, doneUrl } satisfies PendingTabOAuth,
  });
  return redirect;
}

/** Finishes a login whose waiter was lost when the background restarted. */
export type OrphanRedirectHandler = (redirectUrl: string, verifier: string) => Promise<void>;

async function handleTabUrl(
  tabId: number,
  url: string,
  onOrphanRedirect: OrphanRedirectHandler,
): Promise<void> {
  const waiter = waiters.get(tabId);
  const pending = waiter ? null : await loadPending();
  const doneUrl = waiter?.doneUrl ?? (pending?.tabId === tabId ? pending.doneUrl : null);
  if (!doneUrl || !isDoneUrl(url, doneUrl)) return;

  waiters.delete(tabId);
  await clearPending();
  // Closing it fires onRemoved, which finds nothing left to cancel.
  await browser.tabs.remove(tabId).catch(() => undefined);

  if (waiter) {
    waiter.resolve(url);
  } else if (pending) {
    await onOrphanRedirect(url, pending.verifier);
  }
}

async function handleTabRemoved(tabId: number): Promise<void> {
  const waiter = waiters.get(tabId);
  if (waiter) {
    waiters.delete(tabId);
    waiter.reject(new OAuthCancelledError());
  }
  const pending = await loadPending();
  if (pending?.tabId === tabId) await clearPending();
}

/**
 * Registers the sign-in tab listeners. Call once, synchronously, when the
 * background script starts, so a restarted Safari background page still gets
 * the events that finish a login.
 */
export function registerTabOAuthListeners(onOrphanRedirect: OrphanRedirectHandler): void {
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) void handleTabUrl(tabId, changeInfo.url, onOrphanRedirect);
  });
  browser.tabs.onRemoved.addListener((tabId) => {
    void handleTabRemoved(tabId);
  });
}
