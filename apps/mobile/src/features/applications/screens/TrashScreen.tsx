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
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

function TrashRow({ application }: { application: Application }) {
  const { t } = useTranslation('applications');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const restore = useRestoreApplication();
  const permanentlyDelete = usePermanentlyDeleteApplication();

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
      <View style={styles.textColumn}>
        <Text style={styles.role} numberOfLines={1}>
          {application.role}
        </Text>
        <Text style={styles.company} numberOfLines={1}>
          {application.company}
        </Text>
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
          <Text style={styles.restoreButtonText}>{t('trash.restore')}</Text>
        </Pressable>
        <Pressable
          style={styles.deleteButton}
          onPress={onPermanentlyDelete}
          disabled={permanentlyDelete.isPending}
          testID={`permanently-delete-button-${application.id}`}
        >
          <Text style={styles.deleteButtonText}>{t('trash.delete')}</Text>
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
    separator: { height: 10 },
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
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
    },
    textColumn: { flex: 1, gap: 2 },
    role: { fontSize: 15, fontWeight: '600', color: colors.text },
    company: { fontSize: 13, color: colors.textMuted },
    actions: { flexDirection: 'row', gap: 8 },
    restoreButton: {
      minHeight: 36,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    restoreButtonText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
    deleteButton: {
      minHeight: 36,
      paddingHorizontal: 12,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.dangerSurface,
      borderWidth: 1,
      borderColor: colors.dangerBorder,
    },
    deleteButtonText: { fontSize: 13, fontWeight: '600', color: colors.danger },
  });
}
