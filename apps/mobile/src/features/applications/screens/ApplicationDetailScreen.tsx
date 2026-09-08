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
import {
  useActivityLogs,
  useApplication,
  useApplicationHealthScore,
} from '../hooks/useApplicationQueries';
import { useDeleteApplication } from '../hooks/useApplicationMutations';
import { StatusBadge } from '../components/StatusBadge';
import { SectionTabBar } from '../components/SectionTabBar';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

const EVENT_LABELS: Record<string, string> = {
  status_changed: 'Status changed',
  note_added: 'Note added',
  note_deleted: 'Note deleted',
  document_uploaded: 'Document uploaded',
  document_deleted: 'Document deleted',
  interview_added: 'Interview round added',
  field_updated: 'Fields updated',
};

function formatActivityDetail(eventType: string, payloadStr: string): string {
  try {
    const payload = JSON.parse(payloadStr);
    if (eventType === 'status_changed') return `${payload.from} → ${payload.to}`;
    if (eventType === 'field_updated' && Array.isArray(payload.fields)) {
      return payload.fields.join(', ');
    }
  } catch {
    // Payload isn't JSON or doesn't have the expected shape — show nothing extra.
  }
  return '';
}

function initialsFor(company: string): string {
  const words = company.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function healthScoreTone(colors: ThemeColors, score: number): string {
  if (score >= 71) return colors.primary;
  if (score >= 41) return '#a16207';
  return colors.danger;
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
  const { data: activityLogs } = useActivityLogs(applicationId);
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
        <Pressable
          style={styles.menuButton}
          onPress={openMenu}
          testID="application-detail-menu-button"
        >
          <Text style={styles.menuDots}>•••</Text>
        </Pressable>
      </View>

      <Text style={styles.role}>{application.role}</Text>
      {subline ? <Text style={styles.subline}>{subline}</Text> : null}

      <View style={styles.statusRow}>
        <StatusBadge status={application.status} />
      </View>

      <SectionTabBar
        variant="underline"
        items={[
          { key: 'overview', label: t('detail.overviewTab') },
          { key: 'interviews', label: t('detail.interviewsTab') },
          { key: 'notes', label: t('detail.notesTab') },
          { key: 'documents', label: t('detail.docsTab') },
        ]}
        activeKey="overview"
        onSelect={(key) => {
          if (key === 'overview') return;
          // This screen is the [id]/index route, so expo-router resolves a
          // bare relative push ('./notes') against the parent of `[id]`,
          // dropping applicationId from the URL entirely and 404ing the
          // sub-screen's query. Sibling non-index screens (notes.tsx etc, see
          // DETAIL_SECTION_ROUTES) don't have this quirk — only an index
          // route does — so the id has to be spelled out here explicitly.
          router.push(`./${applicationId}/${key}` as never);
        }}
      />

      {healthScore ? (
        <View style={styles.card} testID="health-score-card">
          <View style={styles.healthScoreRow}>
            <Text style={styles.cardLabel}>{t('detail.healthScoreLabel')}</Text>
            <Text
              style={[
                styles.healthScoreValue,
                { color: healthScoreTone(colors, healthScore.score) },
              ]}
            >
              {healthScore.score} / 100
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.max(0, Math.min(100, healthScore.score))}%`,
                  backgroundColor: healthScoreTone(colors, healthScore.score),
                },
              ]}
            />
          </View>
        </View>
      ) : null}

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
          <Text style={styles.fieldValue}>{application.description}</Text>
        </View>
      ) : null}

      {application.jobUrl ? (
        <Pressable onPress={() => void Linking.openURL(application.jobUrl!)}>
          <Text style={styles.link}>{application.jobUrl}</Text>
        </Pressable>
      ) : null}

      <Text style={styles.sectionHeader}>{t('detail.activityLabel')}</Text>
      {activityLogs && activityLogs.length > 0 ? (
        <View style={styles.timeline} testID="activity-timeline">
          {activityLogs.map((log, index) => {
            const detail = formatActivityDetail(log.eventType, log.payload);
            return (
              <View key={log.id} style={styles.timelineRow}>
                <View style={styles.timelineMarkerColumn}>
                  <View style={[styles.timelineDot, index === 0 && styles.timelineDotActive]} />
                  {index < activityLogs.length - 1 ? <View style={styles.timelineLine} /> : null}
                </View>
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineTitle}>
                    {EVENT_LABELS[log.eventType] ?? log.eventType}
                    {detail ? <Text style={styles.timelineDetail}> — {detail}</Text> : null}
                  </Text>
                  <Text style={styles.timelineDate}>
                    {new Date(log.createdAt).toLocaleString()}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.emptyText}>{t('detail.noActivityYet')}</Text>
      )}
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
    cardLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
    healthScoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    healthScoreValue: { fontSize: 16, fontWeight: '700' },
    progressTrack: {
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.surfaceAlt,
      overflow: 'hidden',
    },
    progressFill: { height: '100%', borderRadius: 4 },
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
    sectionHeader: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 4 },
    emptyText: { fontSize: 13, color: colors.textFaint },
    timeline: { gap: 0 },
    timelineRow: { flexDirection: 'row', gap: 12 },
    timelineMarkerColumn: { alignItems: 'center', width: 12 },
    timelineDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.border,
      marginTop: 4,
    },
    timelineDotActive: { backgroundColor: colors.primary },
    timelineLine: { width: 1, flex: 1, backgroundColor: colors.border, marginVertical: 2 },
    timelineContent: { flex: 1, paddingBottom: 16 },
    timelineTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
    timelineDetail: { fontWeight: '400', color: colors.textSubtle },
    timelineDate: { fontSize: 12, color: colors.textFaint, marginTop: 2 },
  });
}
