import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useInterviewRoundAnalytics } from '../hooks/useAnalyticsQueries';
import { AnalyticsCard } from './AnalyticsCard';
import { RatioBar } from './RatioBar';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

function formatRounds(n: number | null): string {
  if (n === null) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function InterviewRoundAnalyticsSection() {
  const { t } = useTranslation('analytics');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data, isLoading } = useInterviewRoundAnalytics();

  if (isLoading) return <ActivityIndicator color={colors.primary} />;
  if (!data) return null;

  return (
    <AnalyticsCard
      title={t('cards.interviewRounds')}
      description={t('cards.interviewRoundsDescription')}
      testID="interview-round-analytics-section"
    >
      {data.byType.length === 0 ? (
        <Text style={styles.empty}>{t('noInterviewRoundsLogged')}</Text>
      ) : (
        data.byType.map((stat) => {
          const decided = stat.passed + stat.failed;
          const passRate = decided > 0 ? Math.round((stat.passed / decided) * 100) : null;
          return (
            <RatioBar
              key={stat.type}
              label={stat.type}
              meta={`${stat.passed}/${decided}`}
              percent={passRate}
              color="#22c55e"
              sampleSize={decided}
              testID={`interview-round-${stat.type}`}
            />
          );
        })
      )}

      <View style={styles.summaryRow}>
        <View style={styles.summaryCol}>
          <Text style={styles.summaryLabel}>{t('roundsBeforeOffer')}</Text>
          <Text style={styles.summaryValue}>
            {t('medianValue', { value: formatRounds(data.roundsToOffer.median) })}
          </Text>
          <Text style={styles.summaryMeta}>
            {data.roundsToOffer.sampleSize > 0
              ? t('offersCount', { count: data.roundsToOffer.sampleSize })
              : t('noOffersYet')}
          </Text>
        </View>
        <View style={styles.summaryCol}>
          <Text style={styles.summaryLabel}>{t('roundsBeforeRejection')}</Text>
          <Text style={styles.summaryValue}>
            {t('medianValue', { value: formatRounds(data.roundsToRejection.median) })}
          </Text>
          <Text style={styles.summaryMeta}>
            {data.roundsToRejection.sampleSize > 0
              ? t('rejectionsCount', { count: data.roundsToRejection.sampleSize })
              : t('noRejectionsYet')}
          </Text>
        </View>
      </View>
    </AnalyticsCard>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    empty: { fontSize: 12, color: colors.textFaint },
    summaryRow: {
      flexDirection: 'row',
      gap: 16,
      borderTopWidth: 1,
      borderTopColor: colors.surfaceAlt,
      paddingTop: 10,
      marginTop: 4,
    },
    summaryCol: { flex: 1, gap: 2 },
    summaryLabel: { fontSize: 10, color: colors.textFaint },
    summaryValue: { fontSize: 14, fontWeight: '700', color: colors.text },
    summaryMeta: { fontSize: 10, color: colors.textFaint },
  });
}
