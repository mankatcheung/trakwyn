import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { SUPPORTED_LANGUAGES, type LanguageMode } from './config';

const LANGUAGE_KEY = 'trakwyn_language_mode';
const VALID_MODES: LanguageMode[] = ['system', ...SUPPORTED_LANGUAGES.map((l) => l.code)];

// Mirrors src/theme/themeStorage.ts: expo-secure-store has no web
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

export async function getLanguageMode(): Promise<LanguageMode | null> {
  const raw = await storage.getItem(LANGUAGE_KEY);
  return VALID_MODES.includes(raw as LanguageMode) ? (raw as LanguageMode) : null;
}

export async function setLanguageMode(mode: LanguageMode): Promise<void> {
  await storage.setItem(LANGUAGE_KEY, mode);
}
