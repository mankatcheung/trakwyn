import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser, type Browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { OAuthCancelledError } from './oauth';
import { isDoneUrl, registerTabOAuthListeners, runTabOAuth } from './tabOAuth';
import { STORAGE_KEYS } from '../constants';

const START_URL = 'https://api.example.com/auth/oauth/google/start?platform=extension-tab';
const DONE_URL = 'https://api.example.com/auth/oauth/extension/done';

const onOrphanRedirect = vi.fn(async () => undefined);

/** Lets the listeners' async work (storage reads, tab removal) settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function navigate(tabId: number, url: string): Promise<void> {
  await fakeBrowser.tabs.onUpdated.trigger(tabId, { url }, { id: tabId } as Browser.tabs.Tab);
  await settle();
}

async function pendingLogin(): Promise<unknown> {
  const result = await browser.storage.session.get(STORAGE_KEYS.PENDING_TAB_OAUTH);
  return result[STORAGE_KEYS.PENDING_TAB_OAUTH];
}

/** Starts a login and returns its tab ID with the (not yet settled) result. */
async function startLogin(): Promise<{ tabId: number; result: Promise<string> }> {
  const create = vi.spyOn(browser.tabs, 'create');
  const result = runTabOAuth(START_URL, DONE_URL, 'verifier-1');
  await settle();
  const tab = await create.mock.results[0]!.value;
  return { tabId: tab.id, result };
}

beforeEach(() => {
  fakeBrowser.reset();
  onOrphanRedirect.mockClear();
  registerTabOAuthListeners(onOrphanRedirect);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runTabOAuth', () => {
  it('opens the start URL and remembers the login in session storage', async () => {
    const { tabId } = await startLogin();

    expect(browser.tabs.create).toHaveBeenCalledWith({ url: START_URL });
    expect(await pendingLogin()).toEqual({ tabId, verifier: 'verifier-1', doneUrl: DONE_URL });
  });

  it('resolves with the done URL, closes the tab and forgets the login', async () => {
    const { tabId, result } = await startLogin();
    const remove = vi.spyOn(browser.tabs, 'remove');

    await navigate(tabId, `${DONE_URL}?code=handoff-code`);

    await expect(result).resolves.toBe(`${DONE_URL}?code=handoff-code`);
    expect(remove).toHaveBeenCalledWith(tabId);
    expect(await pendingLogin()).toBeUndefined();
  });

  it('hands back an error redirect the same way, for the caller to read', async () => {
    const { tabId, result } = await startLogin();

    await navigate(tabId, `${DONE_URL}?oauthError=email_in_use`);

    await expect(result).resolves.toBe(`${DONE_URL}?oauthError=email_in_use`);
  });

  it('waits through the provider pages and ignores other tabs', async () => {
    const { tabId, result } = await startLogin();
    const settled = vi.fn();
    void result.then(settled, settled);

    await navigate(tabId, 'https://accounts.google.com/o/oauth2/v2/auth?client_id=x');
    await navigate(tabId + 1, `${DONE_URL}?code=someone-elses`);
    await settle();

    expect(settled).not.toHaveBeenCalled();
    expect(await pendingLogin()).toMatchObject({ tabId });
  });

  it('treats a closed sign-in tab as a cancel', async () => {
    const { tabId, result } = await startLogin();
    const outcome = expect(result).rejects.toBeInstanceOf(OAuthCancelledError);

    await fakeBrowser.tabs.onRemoved.trigger(tabId, { windowId: 1, isWindowClosing: false });
    await settle();

    await outcome;
    expect(await pendingLogin()).toBeUndefined();
  });
});

describe('a login that outlived its background instance', () => {
  beforeEach(async () => {
    // What a restarted background finds: the stored login, but no waiter.
    await browser.storage.session.set({
      [STORAGE_KEYS.PENDING_TAB_OAUTH]: { tabId: 42, verifier: 'verifier-1', doneUrl: DONE_URL },
    });
  });

  it('is finished from storage with the stored verifier', async () => {
    await navigate(42, `${DONE_URL}?code=handoff-code`);

    expect(onOrphanRedirect).toHaveBeenCalledWith(`${DONE_URL}?code=handoff-code`, 'verifier-1');
    expect(await pendingLogin()).toBeUndefined();
  });

  it('is forgotten if its tab is closed first', async () => {
    await fakeBrowser.tabs.onRemoved.trigger(42, { windowId: 1, isWindowClosing: false });
    await settle();

    expect(onOrphanRedirect).not.toHaveBeenCalled();
    expect(await pendingLogin()).toBeUndefined();
  });
});

describe('isDoneUrl', () => {
  it('matches the origin and path, whatever the query', () => {
    expect(isDoneUrl(`${DONE_URL}?code=x`, DONE_URL)).toBe(true);
  });

  it('rejects the same path on another origin', () => {
    expect(isDoneUrl('https://evil.example/auth/oauth/extension/done?code=x', DONE_URL)).toBe(
      false,
    );
  });

  it('rejects another path on the API origin, and URLs that do not parse', () => {
    expect(isDoneUrl('https://api.example.com/auth/oauth/google/callback', DONE_URL)).toBe(false);
    expect(isDoneUrl('not a url', DONE_URL)).toBe(false);
  });
});
