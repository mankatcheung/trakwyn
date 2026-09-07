import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getLanguageMode, setLanguageMode } from '../languageStorage';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const mockedSecureStore = jest.mocked(SecureStore);

const LANGUAGE_KEY = 'trakwyn_language_mode';

describe('languageStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('on web', () => {
    const store = new Map<string, string>();
    const fakeLocalStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    };

    beforeEach(() => {
      Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
      Object.defineProperty(globalThis, 'localStorage', {
        value: fakeLocalStorage,
        configurable: true,
      });
      store.clear();
    });

    afterEach(() => {
      Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    });

    it('reads and writes the mode via localStorage instead of SecureStore', async () => {
      await setLanguageMode('zh-CN');

      expect(mockedSecureStore.setItemAsync).not.toHaveBeenCalled();
      await expect(getLanguageMode()).resolves.toBe('zh-CN');
    });
  });

  it('writes the mode to SecureStore', async () => {
    await setLanguageMode('zh-CN');

    expect(mockedSecureStore.setItemAsync).toHaveBeenCalledWith(LANGUAGE_KEY, 'zh-CN');
  });

  it.each(['en', 'zh-CN', 'system'] as const)('reads a valid stored mode %s back', async (mode) => {
    mockedSecureStore.getItemAsync.mockResolvedValueOnce(mode);

    await expect(getLanguageMode()).resolves.toBe(mode);
  });

  it('returns null when nothing is stored', async () => {
    mockedSecureStore.getItemAsync.mockResolvedValueOnce(null);

    await expect(getLanguageMode()).resolves.toBeNull();
  });

  it('treats an unrecognized value as unset', async () => {
    mockedSecureStore.getItemAsync.mockResolvedValueOnce('fr');

    await expect(getLanguageMode()).resolves.toBeNull();
  });
});
