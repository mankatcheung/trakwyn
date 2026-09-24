import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * One key for the pair. Two keys meant two independent writes, and a fresh
 * access token beside a stale refresh token is exactly what the API's
 * RotateRefreshTokenUseCase classifies as reuse — past its 10-second
 * rotation grace it revokes the whole session and logs "Refresh token reuse
 * detected". A pair that cannot be half-written cannot be mistaken for a
 * stolen one.
 */
const SESSION_KEY = 'trakwyn_session';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// expo-secure-store has no web implementation, so on web we fall back to
// localStorage instead of calling its native-only APIs.
//
// That makes the web target a development preview only: a refresh token in
// localStorage is readable by any script on the page, which is the exact
// exposure apps/web moved to HttpOnly cookies to remove. Shipping this
// target means switching it to the cookie mutations (`login`/`refreshToken`
// with `credentials: 'include'`) rather than storing tokens at all — see
// apps/mobile/CLAUDE.md, Auth transport.
const storage = {
  getItem: (key: string): Promise<string | null> =>
    Platform.OS === 'web'
      ? Promise.resolve(globalThis.localStorage?.getItem(key) ?? null)
      : SecureStore.getItemAsync(key),
  setItem: (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(key, value);
      return Promise.resolve();
    }
    return SecureStore.setItemAsync(key, value);
  },
  deleteItem: (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.removeItem(key);
      return Promise.resolve();
    }
    return SecureStore.deleteItemAsync(key);
  },
};

export async function getTokens(): Promise<TokenPair | null> {
  const raw = await storage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TokenPair> | null;
    if (typeof parsed?.accessToken === 'string' && typeof parsed.refreshToken === 'string') {
      return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken };
    }
  } catch {
    // Unparseable — fall through and treat it as no session.
  }
  await storage.deleteItem(SESSION_KEY);
  return null;
}

export async function setTokens(tokens: TokenPair): Promise<void> {
  await storage.setItem(SESSION_KEY, JSON.stringify(tokens));
}

export async function clearTokens(): Promise<void> {
  await storage.deleteItem(SESSION_KEY);
}
