import { browser } from 'wxt/browser';
import { STORAGE_KEYS } from '../constants';
import { captureException } from './observability/report';
import type { CurrentUser } from './api';

export interface AuthState {
  token: string;
  refreshToken: string;
  /** When `token` expires, in epoch ms. The refresh token outlives it. */
  expiresAt: number;
}

function isAuthState(value: unknown): value is AuthState {
  const auth = value as Partial<AuthState> | undefined;
  return (
    typeof auth?.token === 'string' &&
    typeof auth.refreshToken === 'string' &&
    typeof auth.expiresAt === 'number'
  );
}

/**
 * The stored session, even when its access token has expired — the refresh
 * token can still renew it. A shape from an older build (no refresh token)
 * reads as signed out.
 */
export async function getAuth(): Promise<AuthState | null> {
  const result = await browser.storage.session.get(STORAGE_KEYS.AUTH);
  const auth: unknown = result[STORAGE_KEYS.AUTH];
  return isAuthState(auth) ? auth : null;
}

interface AccessLevelArea {
  setAccessLevel?: (options: { accessLevel: 'TRUSTED_CONTEXTS' }) => Promise<void>;
}

/**
 * Keeps `storage.local` to extension pages and the background worker.
 * Unlike `storage.session`, it is readable from content scripts by default,
 * and the Clipper's content script runs inside job-board pages, so the
 * persisted refresh token must not be reachable from it. Chrome applies this
 * per browser session, hence every write calls it. A browser without
 * `setAccessLevel` is left as it is.
 */
export async function restrictLocalStorageToTrustedContexts(): Promise<void> {
  const area = browser.storage.local as unknown as AccessLevelArea;
  if (typeof area.setAccessLevel !== 'function') return;
  await area.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
}

/**
 * Stores the session. With `persist` the refresh token is also kept in
 * `storage.local`, so the next browser launch can restore the session
 * (JEF-421); without it, any copy left by an earlier login is removed.
 */
export async function setAuth(auth: AuthState, persist = false): Promise<void> {
  await browser.storage.session.set({ [STORAGE_KEYS.AUTH]: auth });
  if (persist) {
    await restrictLocalStorageToTrustedContexts().catch((err: unknown) => {
      void captureException(err, { action: 'restrict_local_storage' });
    });
    await browser.storage.local.set({ [STORAGE_KEYS.PERSISTED_REFRESH_TOKEN]: auth.refreshToken });
  } else {
    await browser.storage.local.remove(STORAGE_KEYS.PERSISTED_REFRESH_TOKEN);
  }
}

/** The refresh token kept across browser restarts, or null if the user did not opt in. */
export async function getPersistedRefreshToken(): Promise<string | null> {
  const result = await browser.storage.local.get(STORAGE_KEYS.PERSISTED_REFRESH_TOKEN);
  const token: unknown = result[STORAGE_KEYS.PERSISTED_REFRESH_TOKEN];
  return typeof token === 'string' && token !== '' ? token : null;
}

/** Signs out: removes the session, the cached user and any persisted refresh token. */
export async function clearAuth(): Promise<void> {
  await clearSessionAuth();
  await browser.storage.local.remove(STORAGE_KEYS.PERSISTED_REFRESH_TOKEN);
}

/** Drops the in-memory session only, keeping a persisted refresh token to retry with. */
export async function clearSessionAuth(): Promise<void> {
  await browser.storage.session.remove([STORAGE_KEYS.AUTH, STORAGE_KEYS.CACHED_USER]);
}

function isCurrentUser(value: unknown): value is CurrentUser {
  const user = value as Partial<CurrentUser> | undefined;
  return (
    typeof user?.id === 'string' &&
    typeof user.email === 'string' &&
    (user.name === null || typeof user.name === 'string') &&
    (user.avatarUrl === null || typeof user.avatarUrl === 'string')
  );
}

/**
 * The user the API last confirmed in this browser session (JEF-457). It is
 * only shown, never trusted: the popup confirms it with the API before
 * anything can be saved. Kept in `storage.session`, which content scripts
 * cannot read.
 */
export async function getCachedUser(): Promise<CurrentUser | null> {
  const result = await browser.storage.session.get(STORAGE_KEYS.CACHED_USER);
  const user: unknown = result[STORAGE_KEYS.CACHED_USER];
  return isCurrentUser(user) ? user : null;
}

export async function setCachedUser(user: CurrentUser): Promise<void> {
  await browser.storage.session.set({ [STORAGE_KEYS.CACHED_USER]: user });
}
