import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { ThemeMode } from './colors';

const THEME_KEY = 'trakwyn_theme_mode';
const VALID_MODES: ThemeMode[] = ['light', 'dark', 'system'];

// Mirrors src/auth/tokenStorage.ts: expo-secure-store has no web
// implementation, so the web preview target falls back to localStorage.
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
};

export async function getThemeMode(): Promise<ThemeMode | null> {
  const raw = await storage.getItem(THEME_KEY);
  return VALID_MODES.includes(raw as ThemeMode) ? (raw as ThemeMode) : null;
}

export async function setThemeMode(mode: ThemeMode): Promise<void> {
  await storage.setItem(THEME_KEY, mode);
}
