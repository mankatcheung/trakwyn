import React from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useResponseTimeAnalytics } from '../hooks/useAnalyticsQueries';
import { statusLabel } from '../../applications/components/StatusBadge';
import type { ApplicationStatus } from '../../applications/types';
import { AnalyticsCard } from './AnalyticsCard';
import { RatioBar } from './RatioBar';
import { useTheme } from '../../../theme/ThemeContext';

function formatDays(n: number | null): string {
  if (n === null) return '—';
  return `${n < 10 ? n.toFixed(1) : Math.round(n)}d`;
}

export function ResponseTimeAnalyticsSection() {
  const { t } = useTranslation('analytics');
  const { colors } = useTheme();
  const { data, isLoading } = useResponseTimeAnalytics();

  if (isLoading) return <ActivityIndicator color={colors.primary} />;
  if (!data) return null;

  const maxMedian = Math.max(1, ...data.timeInStage.map((s) => s.medianDays ?? 0));

  return (
    <AnalyticsCard
      title={t('cards.responseTimes')}
      description={t('cards.responseTimesDescription')}
      testID="response-time-analytics-section"
    >
      <Text style={{ fontSize: 11, color: colors.textFaint }}>
        {t('firstResponseSummary', {
          value: formatDays(data.timeToFirstResponse.medianDays),
          detail:
            data.timeToFirstResponse.sampleSize > 0
              ? t('applicationsCount', { count: data.timeToFirstResponse.sampleSize })
              : t('noResponsesYet'),
        })}
      </Text>

      {data.timeInStage.length === 0 ? (
        <Text style={{ fontSize: 12, color: colors.textFaint }}>{t('noStageDurationsYet')}</Text>
      ) : (
        data.timeInStage.map((stat) => (
          <RatioBar
            key={stat.status}
            label={statusLabel(stat.status as ApplicationStatus)}
            percent={((stat.medianDays ?? 0) / maxMedian) * 100}
            percentLabel={formatDays(stat.medianDays)}
            color={colors.primary}
            sampleSize={stat.sampleSize}
            testID={`response-time-${stat.status}`}
          />
        ))
      )}
    </AnalyticsCard>
  );
}
