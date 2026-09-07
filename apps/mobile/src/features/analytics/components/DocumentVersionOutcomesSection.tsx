import React from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useDocumentVersionOutcomes } from '../hooks/useAnalyticsQueries';
import { AnalyticsCard } from './AnalyticsCard';
import { RatioBar } from './RatioBar';
import { useTheme } from '../../../theme/ThemeContext';

export function DocumentVersionOutcomesSection() {
  const { t } = useTranslation('analytics');
  const { colors } = useTheme();
  const { data, isLoading } = useDocumentVersionOutcomes();

  const documentTypeLabel: Record<string, string> = {
    resume: t('documentType.resume'),
    cover_letter: t('documentType.coverLetter'),
  };

  if (isLoading) return <ActivityIndicator color={colors.primary} />;
  if (!data) return null;

  return (
    <AnalyticsCard
      title={t('cards.documentVersionOutcomes')}
      description={t('cards.documentVersionOutcomesDescription')}
      testID="document-version-outcomes-section"
    >
      {data.length === 0 ? (
        <Text style={{ fontSize: 12, color: colors.textFaint }}>
          {t('noDocumentVersionsTracked')}
        </Text>
      ) : (
        data.map((o) => (
          <RatioBar
            key={`${o.documentType}::${o.version ?? ''}`}
            label={`${documentTypeLabel[o.documentType] ?? o.documentType}: ${o.version ?? '—'}`}
            meta={`${o.interviewCount}/${o.applicationCount}`}
            percent={o.interviewRate}
            color="#a855f7"
            sampleSize={o.applicationCount}
            testID={`document-outcome-${o.documentType}-${o.version ?? 'none'}`}
          />
        ))
      )}
    </AnalyticsCard>
  );
}
