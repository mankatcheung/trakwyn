import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getThemeMode, setThemeMode } from '../themeStorage';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const mockedSecureStore = jest.mocked(SecureStore);

const THEME_KEY = 'trakwyn_theme_mode';

describe('themeStorage', () => {
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
      await setThemeMode('dark');

      expect(mockedSecureStore.setItemAsync).not.toHaveBeenCalled();
      await expect(getThemeMode()).resolves.toBe('dark');
    });
  });

  it('writes the mode to SecureStore', async () => {
    await setThemeMode('dark');

    expect(mockedSecureStore.setItemAsync).toHaveBeenCalledWith(THEME_KEY, 'dark');
  });

  it.each(['light', 'dark', 'system'] as const)(
    'reads a valid stored mode %s back',
    async (mode) => {
      mockedSecureStore.getItemAsync.mockResolvedValueOnce(mode);

      await expect(getThemeMode()).resolves.toBe(mode);
    },
  );

  it('returns null when nothing is stored', async () => {
    mockedSecureStore.getItemAsync.mockResolvedValueOnce(null);

    await expect(getThemeMode()).resolves.toBeNull();
  });

  it('treats an unrecognized value as unset', async () => {
    mockedSecureStore.getItemAsync.mockResolvedValueOnce('solarized');

    await expect(getThemeMode()).resolves.toBeNull();
  });
});
