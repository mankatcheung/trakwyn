import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useApplication } from '../hooks/useApplicationQueries';
import { useDeleteApplication } from '../hooks/useApplicationMutations';
import { StatusBadge } from '../components/StatusBadge';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

function Field({ label, value }: { label: string; value: string | null }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!value) return null;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

export function ApplicationDetailScreen() {
  const { t } = useTranslation('applications');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { id: applicationId } = useLocalSearchParams<{ id: string }>();
  const { data: application, isLoading, isError, error } = useApplication(applicationId);
  const deleteApplication = useDeleteApplication();

  const onDelete = () => {
    Alert.alert(t('detail.moveToTrashTitle'), t('detail.moveToTrashMessage'), [
      { text: t('detail.cancel'), style: 'cancel' },
      {
        text: t('detail.delete'),
        style: 'destructive',
        onPress: () => {
          deleteApplication.mutate(applicationId, {
            onSuccess: () => router.back(),
            onError: (err) => Alert.alert(t('detail.couldNotDeleteTitle'), getErrorMessage(err)),
          });
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator
          size="large"
          color={colors.primary}
          testID="application-detail-loading"
        />
      </View>
    );
  }

  if (isError || !application) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error ? getErrorMessage(error) : t('detail.notFound')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.role}>{application.role}</Text>
          <Text style={styles.company}>{application.company}</Text>
        </View>
        <StatusBadge status={application.status} />
      </View>

      <Field label={t('detail.locationLabel')} value={application.location} />
      <Field label={t('detail.salaryRangeLabel')} value={application.salaryRange} />
      <Field label={t('detail.sourceLabel')} value={application.source} />
      <Field label={t('detail.descriptionLabel')} value={application.description} />

      {application.jobUrl ? (
        <Pressable onPress={() => void Linking.openURL(application.jobUrl!)}>
          <Text style={styles.link}>{application.jobUrl}</Text>
        </Pressable>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          style={styles.editButton}
          onPress={() => router.push('./notes')}
          testID="notes-button"
        >
          <Text style={styles.editButtonText}>{t('detail.notes')}</Text>
        </Pressable>
        <Pressable
          style={styles.editButton}
          onPress={() => router.push('./documents')}
          testID="documents-button"
        >
          <Text style={styles.editButtonText}>{t('detail.documents')}</Text>
        </Pressable>
        <Pressable
          style={styles.editButton}
          onPress={() => router.push('./offers')}
          testID="offers-button"
        >
          <Text style={styles.editButtonText}>{t('detail.offers')}</Text>
        </Pressable>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={styles.editButton}
          onPress={() => router.push('./edit')}
          testID="edit-application-button"
        >
          <Text style={styles.editButtonText}>{t('detail.edit')}</Text>
        </Pressable>
        <Pressable
          style={styles.deleteButton}
          onPress={onDelete}
          disabled={deleteApplication.isPending}
          testID="delete-application-button"
        >
          <Text style={styles.deleteButtonText}>
            {deleteApplication.isPending ? t('detail.deleting') : t('detail.moveToTrash')}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, gap: 16 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    error: { fontSize: 14, color: colors.danger, textAlign: 'center' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    headerText: { flex: 1, gap: 2 },
    role: { fontSize: 20, fontWeight: '700', color: colors.text },
    company: { fontSize: 15, color: colors.textMuted },
    field: { gap: 2 },
    fieldLabel: {
      fontSize: 12,
      color: colors.textSubtle,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    fieldValue: { fontSize: 15, color: colors.text },
    link: { fontSize: 14, color: colors.primary },
    actions: { flexDirection: 'row', gap: 12, marginTop: 12 },
    editButton: {
      flex: 1,
      minHeight: 44,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    editButtonText: { fontSize: 15, fontWeight: '600', color: colors.textMuted },
    deleteButton: {
      flex: 1,
      minHeight: 44,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.dangerSurface,
      borderWidth: 1,
      borderColor: colors.dangerBorder,
    },
    deleteButtonText: { fontSize: 15, fontWeight: '600', color: colors.danger },
  });
}
