import { renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';
import '../../../i18n';

jest.mock('../../../features/notifications/hooks/useNotificationQueries', () => ({
  useUnreadNotificationCount: jest.fn(),
}));
jest.mock('expo-router', () => ({ useRouter: jest.fn() }));
jest.mock('../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));

import { useRouter } from 'expo-router';
import { useUnreadNotificationCount } from '../../../features/notifications/hooks/useNotificationQueries';
import { useTheme } from '../../../theme/ThemeContext';
import { lightColors } from '../../../theme/colors';
import { NotificationBell } from '../NotificationBell';
import { useNotificationBellHeader } from '../useNotificationBellHeader';

const mockedUseRouter = jest.mocked(useRouter);
const mockedUseUnreadNotificationCount = jest.mocked(useUnreadNotificationCount);
const mockedUseTheme = jest.mocked(useTheme);

interface BellItem {
  type: string;
  label: string;
  icon: { type: string; name: string };
  onPress: () => void;
  badge?: { value: number | string };
}

function nativeItems(header: ReturnType<typeof useNotificationBellHeader>): BellItem[] {
  return (header.unstable_headerRightItems?.({} as never) ?? []) as unknown as BellItem[];
}

describe('useNotificationBellHeader (JEF-659)', () => {
  const originalOs = Platform.OS;
  const originalVersion = Platform.Version;

  function useRuntime(os: 'ios' | 'android', version: string | number) {
    Platform.OS = os;
    Object.defineProperty(Platform, 'Version', { value: version, configurable: true });
  }

  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    mockedUseRouter.mockReturnValue({ push: jest.fn() } as never);
    mockedUseUnreadNotificationCount.mockReturnValue({ data: 0 } as never);
  });

  afterEach(() => {
    Platform.OS = originalOs;
    Object.defineProperty(Platform, 'Version', { value: originalVersion, configurable: true });
  });

  describe('on iOS 26 and later', () => {
    it('shows the bell as a native header item, not a hosted React Native view', async () => {
      useRuntime('ios', '26.5');

      const { result } = await renderHook(() => useNotificationBellHeader());

      expect(result.current.headerRight).toBeUndefined();
      const items = nativeItems(result.current);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        type: 'button',
        label: 'Notifications',
        icon: { type: 'sfSymbol', name: 'bell' },
      });
    });

    it('opens the notifications modal when pressed', async () => {
      const push = jest.fn();
      mockedUseRouter.mockReturnValue({ push } as never);
      useRuntime('ios', '26.5');

      const { result } = await renderHook(() => useNotificationBellHeader());
      nativeItems(result.current)[0].onPress();

      expect(push).toHaveBeenCalledWith('/notifications');
    });

    it('has no badge when there are no unread notifications', async () => {
      useRuntime('ios', '26.5');

      const { result } = await renderHook(() => useNotificationBellHeader());

      expect(nativeItems(result.current)[0].badge).toBeUndefined();
    });

    it('badges the unread count', async () => {
      mockedUseUnreadNotificationCount.mockReturnValue({ data: 3 } as never);
      useRuntime('ios', '26.5');

      const { result } = await renderHook(() => useNotificationBellHeader());

      expect(nativeItems(result.current)[0].badge).toMatchObject({ value: 3 });
    });

    it('caps the badge at 9+', async () => {
      mockedUseUnreadNotificationCount.mockReturnValue({ data: 12 } as never);
      useRuntime('ios', '26.5');

      const { result } = await renderHook(() => useNotificationBellHeader());

      expect(nativeItems(result.current)[0].badge).toMatchObject({ value: '9+' });
    });

    it('reads a numeric platform version too', async () => {
      useRuntime('ios', 26);

      const { result } = await renderHook(() => useNotificationBellHeader());

      expect(nativeItems(result.current)).toHaveLength(1);
    });
  });

  describe('where native bell items are not used', () => {
    it.each([
      ['iOS 18', 'ios', '18.3'],
      ['iOS 25', 'ios', '25.9'],
      ['Android', 'android', 34],
    ] as const)('keeps the hosted bell on %s', async (_name, os, version) => {
      useRuntime(os, version);

      const { result } = await renderHook(() => useNotificationBellHeader());

      expect(result.current.unstable_headerRightItems).toBeUndefined();
      const element = result.current.headerRight?.({} as never) as { type: unknown };
      expect(element.type).toBe(NotificationBell);
    });
  });
});
