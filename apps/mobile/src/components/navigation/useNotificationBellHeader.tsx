import React, { useMemo, type ComponentProps } from 'react';
import { Platform } from 'react-native';
import { useRouter, type Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useUnreadNotificationCount } from '../../features/notifications/hooks/useNotificationQueries';
import { useTheme } from '../../theme/ThemeContext';
import { NotificationBell } from './NotificationBell';

/** `Stack.Screen` takes its options as an object or as a function returning one; this is the object. */
type ScreenOptions = Exclude<
  NonNullable<ComponentProps<typeof Stack.Screen>['options']>,
  (...args: never[]) => unknown
>;

export type NotificationBellHeader = Partial<
  Pick<ScreenOptions, 'headerRight' | 'unstable_headerRightItems'>
>;

/** The first iOS release where a native bar button can carry a badge. */
const MIN_IOS_FOR_NATIVE_BELL = 26;

/** The same cap the hosted bell shows on its badge. */
const BADGE_CAP = 9;

const hostedBellHeader: NotificationBellHeader = { headerRight: () => <NotificationBell /> };

function usesNativeBell(): boolean {
  return (
    Platform.OS === 'ios' &&
    Number.parseInt(String(Platform.Version), 10) >= MIN_IOS_FOR_NATIVE_BELL
  );
}

/**
 * The notification bell for a tab's navigation header (JEF-659).
 *
 * On iOS 26 and later it is a native bar button item. Hosting a React Native view in the header
 * of a stack nested in the tab navigator froze the app whenever iOS built its accessibility tree
 * after a second sign-in, which is how UI tests and screen readers read the screen: the main
 * thread sat at 100% CPU inside `UINavigationBarAccessibility`, and Maestro flow 07 timed out.
 * Without the hosted view the freeze does not happen.
 *
 * Android and older iOS keep the hosted bell, which is what they always had.
 *
 * `unstable_headerRightItems` is expo-router's native header items API and may change between
 * releases. It is used only here so there is one place to adjust.
 */
export function useNotificationBellHeader(): NotificationBellHeader {
  const { colors } = useTheme();
  const router = useRouter();
  const { t } = useTranslation('navigation');
  const { data: unreadCount = 0 } = useUnreadNotificationCount();
  const label = t('screenTitles.notifications');
  const native = usesNativeBell();

  return useMemo(() => {
    if (!native) return hostedBellHeader;
    return {
      unstable_headerRightItems: () => [
        {
          type: 'button' as const,
          label,
          accessibilityLabel: label,
          icon: { type: 'sfSymbol' as const, name: 'bell' as const },
          tintColor: colors.text,
          badge:
            unreadCount > 0
              ? {
                  value: unreadCount > BADGE_CAP ? `${BADGE_CAP}+` : unreadCount,
                  style: { backgroundColor: colors.danger, color: colors.onDanger },
                }
              : undefined,
          onPress: () => router.push('/notifications'),
        },
      ],
    };
  }, [native, label, unreadCount, colors.text, colors.danger, colors.onDanger, router]);
}
