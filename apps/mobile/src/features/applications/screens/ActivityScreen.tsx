import React, { useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useActivityLogs } from '../hooks/useApplicationQueries';
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

export function ActivityScreen() {
  const { t } = useTranslation('applications');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id: applicationId } = useLocalSearchParams<{ id: string }>();
  const { data: activityLogs, isLoading, isError, error } = useActivityLogs(applicationId);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} testID="activity-loading" />
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
    content: { padding: 20, paddingBottom: 40 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    error: { fontSize: 14, color: colors.danger, textAlign: 'center' },
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
