import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { timeAgo } from '../lib/timeAgo';
import type { NotificationItem } from '../types';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

const TYPE_LABEL: Record<NotificationItem['type'], string> = {
  interview_reminder: '📅',
  follow_up_reminder: '⏰',
  security_alert: '🛡️',
};

interface NotificationListItemProps {
  notification: NotificationItem;
  onPress: () => void;
}

export function NotificationListItem({ notification, onPress }: NotificationListItemProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      style={[styles.container, !notification.read && styles.unreadContainer]}
      onPress={onPress}
      testID={`notification-row-${notification.id}`}
    >
      <Text style={styles.icon}>{TYPE_LABEL[notification.type]}</Text>
      <View style={styles.body}>
        <Text style={[styles.title, !notification.read && styles.unreadTitle]}>
          {notification.title}
        </Text>
        <Text style={styles.text} numberOfLines={2}>
          {notification.body}
        </Text>
        <Text style={styles.time}>{timeAgo(notification.createdAt)}</Text>
      </View>
      {!notification.read && <View style={styles.dot} testID="unread-dot" />}
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: colors.surface,
    },
    unreadContainer: { backgroundColor: colors.primarySurface },
    icon: { fontSize: 16, marginTop: 1 },
    body: { flex: 1, gap: 2 },
    title: { fontSize: 14, color: colors.textMuted },
    unreadTitle: { fontWeight: '700', color: colors.text },
    text: { fontSize: 12, color: colors.textSubtle },
    time: { fontSize: 11, color: colors.textFaint, marginTop: 2 },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
      marginTop: 6,
    },
  });
}
