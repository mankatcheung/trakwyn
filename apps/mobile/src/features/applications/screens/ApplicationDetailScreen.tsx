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
import { useApplication, useApplicationHealthScore } from '../hooks/useApplicationQueries';
import { useDeleteApplication, useUpdateApplication } from '../hooks/useApplicationMutations';
import { StatusBadge } from '../components/StatusBadge';
import { StarIcon } from '../components/ApplicationIcons';
import { HealthScoreCard } from '../components/HealthScoreCard';
import { ApplicationInfoChips } from '../components/ApplicationInfoChips';
import { SectionIndexList } from '../components/SectionIndexList';
import { CollapsibleDescription } from '../components/CollapsibleDescription';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

const STAR_COLOR = '#eab308';

function initialsFor(company: string): string {
  const words = company.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function Field({ label, value }: { label: string; value: string | null }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
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
  const { data: healthScore } = useApplicationHealthScore(applicationId);
  const deleteApplication = useDeleteApplication();
  const updateApplication = useUpdateApplication();

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

  const onToggleStar = () => {
    if (!application) return;
    updateApplication.mutate(
      { id: applicationId, input: { starred: !application.starred } },
      { onError: (err) => Alert.alert(t('detail.couldNotUpdateTitle'), getErrorMessage(err)) },
    );
  };

  const openMenu = () => {
    Alert.alert(t('detail.moreActionsTitle'), undefined, [
      { text: t('detail.edit'), onPress: () => router.push('./edit') },
      { text: t('detail.moveToTrash'), style: 'destructive', onPress: onDelete },
      { text: t('detail.cancel'), style: 'cancel' },
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

  const subline = [application.company, application.location, application.salaryRange]
    .filter(Boolean)
    .join(' · ');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerTop}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initialsFor(application.company)}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.starButton}
            onPress={onToggleStar}
            disabled={updateApplication.isPending}
            testID="application-detail-star-button"
            accessibilityLabel={t(application.starred ? 'detail.unstar' : 'detail.star')}
          >
            <StarIcon
              color={application.starred ? STAR_COLOR : colors.textFaint}
              size={20}
              filled={application.starred}
            />
          </Pressable>
          <Pressable
            style={styles.menuButton}
            onPress={openMenu}
            testID="application-detail-menu-button"
          >
            <Text style={styles.menuDots}>•••</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.role}>{application.role}</Text>
      {subline ? <Text style={styles.subline}>{subline}</Text> : null}

      <View style={styles.statusRow}>
        <StatusBadge status={application.status} />
      </View>

      <ApplicationInfoChips application={application} />

      {healthScore ? <HealthScoreCard healthScore={healthScore} /> : null}

      {application.appliedAt ||
      application.location ||
      application.salaryRange ||
      application.source ? (
        <View style={styles.card}>
          <Field
            label={t('detail.appliedOnLabel')}
            value={
              application.appliedAt ? new Date(application.appliedAt).toLocaleDateString() : null
            }
          />
          <Field label={t('detail.locationLabel')} value={application.location} />
          <Field label={t('detail.salaryRangeLabel')} value={application.salaryRange} />
          <Field label={t('detail.sourceLabel')} value={application.source} />
        </View>
      ) : null}

      {application.description ? (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t('detail.descriptionLabel')}</Text>
          <CollapsibleDescription text={application.description} />
        </View>
      ) : null}

      {application.jobUrl ? (
        <Pressable onPress={() => void Linking.openURL(application.jobUrl!)}>
          <Text style={styles.link}>{application.jobUrl}</Text>
        </Pressable>
      ) : null}

      <SectionIndexList
        onSelect={(slug) => {
          // This screen is the [id]/index route, so expo-router resolves a
          // bare relative push ('./notes') against the parent of `[id]`,
          // dropping applicationId from the URL entirely and 404ing the
          // sub-screen's query. Sibling non-index screens (notes.tsx etc, see
          // DETAIL_SECTION_ROUTES) don't have this quirk — only an index
          // route does — so the id has to be spelled out here explicitly.
          router.push(`./${applicationId}/${slug}` as never);
        }}
      />
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, paddingBottom: 40, gap: 16 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    error: { fontSize: 14, color: colors.danger, textAlign: 'center' },
    headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 14,
      backgroundColor: colors.text,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: colors.background, fontSize: 18, fontWeight: '700' },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    starButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    menuButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    menuDots: { fontSize: 18, color: colors.textSubtle, fontWeight: '700' },
    role: { fontSize: 22, fontWeight: '700', color: colors.text },
    subline: { fontSize: 14, color: colors.textSubtle },
    statusRow: { flexDirection: 'row' },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 12,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    infoLabel: { fontSize: 14, color: colors.textSubtle },
    infoValue: { fontSize: 14, fontWeight: '700', color: colors.text },
    field: { gap: 4 },
    fieldLabel: {
      fontSize: 12,
      color: colors.textSubtle,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    fieldValue: { fontSize: 15, color: colors.text, lineHeight: 21 },
    link: { fontSize: 14, color: colors.primary },
  });
}
