import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTrashedApplications } from '../hooks/useApplicationQueries';
import {
  usePermanentlyDeleteApplication,
  useRestoreApplication,
} from '../hooks/useApplicationMutations';
import type { Application } from '../types';
import { getErrorMessage } from '../../../lib/errors';
import { initialsOf } from '../../../lib/initials';
import { DeleteForeverIcon, RestoreIcon } from '../components/ApplicationIcons';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

const URGENT_DAYS_REMAINING = 3;

function daysRemaining(purgeAt: string | null | undefined): number | null {
  if (!purgeAt) return null;
  const diffMs = new Date(purgeAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
}

function TrashRow({ application }: { application: Application }) {
  const { t } = useTranslation('applications');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const restore = useRestoreApplication();
  const permanentlyDelete = usePermanentlyDeleteApplication();
  const days = daysRemaining(application.purgeAt);
  const isUrgent = days !== null && days <= URGENT_DAYS_REMAINING;

  const onPermanentlyDelete = () => {
    Alert.alert(
      t('trash.deletePermanentlyTitle'),
      t('trash.deletePermanentlyMessage', {
        role: application.role,
        company: application.company,
      }),
      [
        { text: t('trash.cancel'), style: 'cancel' },
        {
          text: t('trash.deleteForever'),
          style: 'destructive',
          onPress: () =>
            permanentlyDelete.mutate(application.id, {
              onError: (err) => Alert.alert(t('trash.couldNotDeleteTitle'), getErrorMessage(err)),
            }),
        },
      ],
    );
  };

  return (
    <View style={styles.row} testID={`trash-item-${application.id}`}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initialsOf(application.company).slice(0, 2)}</Text>
        </View>
        <View style={styles.textColumn}>
          <Text style={styles.company} numberOfLines={1}>
            {application.company}
          </Text>
          <Text style={styles.role} numberOfLines={1}>
            {application.role}
          </Text>
          {days !== null ? (
            <Text style={[styles.deletesIn, isUrgent && styles.deletesInUrgent]}>
              {days === 0 ? t('trash.deletesToday') : t('trash.deletesIn', { count: days })}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          style={styles.restoreButton}
          onPress={() =>
            restore.mutate(application.id, {
              onError: (err) => Alert.alert(t('trash.couldNotRestoreTitle'), getErrorMessage(err)),
            })
          }
          disabled={restore.isPending}
          testID={`restore-button-${application.id}`}
        >
          <RestoreIcon color={colors.textMuted} />
          <Text style={styles.restoreButtonText}>{t('trash.restore')}</Text>
        </Pressable>
        <Pressable
          style={styles.deleteButton}
          onPress={onPermanentlyDelete}
          disabled={permanentlyDelete.isPending}
          testID={`permanently-delete-button-${application.id}`}
        >
          <DeleteForeverIcon color={colors.danger} />
          <Text style={styles.deleteButtonText}>{t('trash.deleteForever')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function TrashScreen() {
  const { t } = useTranslation('applications');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data, isLoading, isError, error } = useTrashedApplications();

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} testID="trash-loading" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{getErrorMessage(error)}</Text>
      </View>
    );
  }

  if (!data || data.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>{t('trash.empty')}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => <TrashRow application={item} />}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    list: { padding: 16, backgroundColor: colors.background },
    separator: { height: 12 },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      backgroundColor: colors.background,
    },
    emptyText: { fontSize: 14, color: colors.textSubtle },
    error: { fontSize: 14, color: colors.danger, textAlign: 'center' },
    row: {
      gap: 14,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
    },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceAlt,
      flexShrink: 0,
    },
    avatarText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
    textColumn: { flex: 1, gap: 2 },
    company: { fontSize: 16, fontWeight: '700', color: colors.text },
    role: { fontSize: 13, color: colors.textSubtle },
    deletesIn: { fontSize: 12, color: colors.textSubtle, marginTop: 2 },
    deletesInUrgent: { color: colors.danger, fontWeight: '600' },
    actions: { flexDirection: 'row', gap: 10 },
    restoreButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 40,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    restoreButtonText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
    deleteButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 40,
      borderRadius: 10,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    deleteButtonText: { fontSize: 14, fontWeight: '600', color: colors.danger },
  });
}
