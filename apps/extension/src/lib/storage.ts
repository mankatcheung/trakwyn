import { browser } from 'wxt/browser';
import { STORAGE_KEYS } from '../constants';

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

export async function setAuth(auth: AuthState): Promise<void> {
  await browser.storage.session.set({ [STORAGE_KEYS.AUTH]: auth });
}

export async function clearAuth(): Promise<void> {
  await browser.storage.session.remove(STORAGE_KEYS.AUTH);
}
