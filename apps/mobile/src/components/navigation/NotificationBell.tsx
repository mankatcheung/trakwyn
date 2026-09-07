import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useUnreadNotificationCount } from '../../features/notifications/hooks/useNotificationQueries';
import { useTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import { NotificationsIcon } from './NavIcons';

export function NotificationBell() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { data: unreadCount = 0 } = useUnreadNotificationCount();

  return (
    <Pressable
      style={styles.button}
      onPress={() => router.push('/notifications')}
      testID="notification-bell"
      hitSlop={8}
    >
      <NotificationsIcon color={colors.text} />
      {unreadCount > 0 && (
        <View style={styles.badge} testID="notification-bell-badge">
          <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
        </View>
      )}
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    button: { padding: 4, marginRight: -4 },
    badge: {
      position: 'absolute',
      top: -2,
      right: -2,
      minWidth: 16,
      height: 16,
      paddingHorizontal: 3,
      borderRadius: 8,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: { fontSize: 9, fontWeight: '700', color: colors.surface },
  });
}
