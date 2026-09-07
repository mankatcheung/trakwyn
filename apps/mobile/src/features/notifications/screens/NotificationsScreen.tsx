import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useNotificationsPage } from '../hooks/useNotificationQueries';
import { useMarkNotificationsRead } from '../hooks/useNotificationMutations';
import { NotificationListItem } from '../components/NotificationListItem';
import { resolveNotificationRoute } from '../lib/resolveNotificationRoute';
import { getErrorMessage } from '../../../lib/errors';
import type { NotificationItem } from '../types';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

export function NotificationsScreen() {
  const { t } = useTranslation('notifications');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useNotificationsPage();
  const markRead = useMarkNotificationsRead();

  const items = data?.pages.flatMap((page) => page.items) ?? [];
  const unreadIds = items.filter((n) => !n.read).map((n) => n.id);

  const onRowPress = (notification: NotificationItem) => {
    if (!notification.read) {
      markRead.mutate({ ids: [notification.id], isRead: true });
    }
    const route = resolveNotificationRoute(notification.url);
    if (!route) return;
    // Dismiss this modal, then push the detail onto the Applications tab's
    // own stack — regardless of which tab was active when the bell was
    // tapped (JEF-291).
    router.back();
    router.push(route);
  };

  return (
    <View style={styles.container}>
      {unreadIds.length > 0 && (
        <View style={styles.headerBar}>
          <Pressable
            onPress={() => markRead.mutate({ ids: unreadIds, isRead: true })}
            testID="mark-all-read-button"
          >
            <Text style={styles.headerAction}>{t('markAllRead')}</Text>
          </Pressable>
        </View>
      )}

      {isLoading ? (
        <ActivityIndicator style={styles.loading} size="large" color={colors.primary} />
      ) : isError ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{getErrorMessage(error)}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{t('allCaughtUp')}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
          }
          renderItem={({ item }) => (
            <NotificationListItem notification={item} onPress={() => onRowPress(item)} />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          onEndReached={() => {
            if (hasNextPage) void fetchNextPage();
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            isFetchingNextPage ? (
              <ActivityIndicator style={styles.footerLoading} color={colors.primary} />
            ) : null
          }
        />
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    headerBar: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerAction: { color: colors.primary, fontSize: 13, fontWeight: '600' },
    loading: { marginTop: 40 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    emptyText: { fontSize: 14, color: colors.textSubtle },
    error: { fontSize: 14, color: colors.danger, textAlign: 'center' },
    separator: { height: 1, backgroundColor: colors.border, marginLeft: 42 },
    footerLoading: { paddingVertical: 16 },
  });
}
