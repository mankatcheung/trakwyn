import { browser } from 'wxt/browser';
import {
  DEFAULT_API_URL,
  DEFAULT_PARSE_MODE,
  PARSE_MODES,
  STORAGE_KEYS,
  type ParseMode,
} from '../constants';

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

export async function getApiUrl(): Promise<string> {
  const result = await browser.storage.sync.get({ [STORAGE_KEYS.API_URL]: DEFAULT_API_URL });
  return result[STORAGE_KEYS.API_URL] as string;
}

export async function setApiUrl(apiUrl: string): Promise<void> {
  await browser.storage.sync.set({ [STORAGE_KEYS.API_URL]: apiUrl });
}

/** How the popup reads a posting. Anything unrecognised reads as the default. */
export async function getParseMode(): Promise<ParseMode> {
  const result = await browser.storage.sync.get(STORAGE_KEYS.PARSE_MODE);
  const mode: unknown = result[STORAGE_KEYS.PARSE_MODE];
  return PARSE_MODES.find((known) => known === mode) ?? DEFAULT_PARSE_MODE;
}

export async function setParseMode(mode: ParseMode): Promise<void> {
  await browser.storage.sync.set({ [STORAGE_KEYS.PARSE_MODE]: mode });
}
