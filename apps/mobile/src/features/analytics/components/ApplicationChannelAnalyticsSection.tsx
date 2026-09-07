import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useApplicationChannelAnalytics } from '../hooks/useAnalyticsQueries';
import { AnalyticsCard } from './AnalyticsCard';
import { RatioBar } from './RatioBar';
import type { ApplicationGroupStat } from '../types';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

function GroupRow({ stat }: { stat: ApplicationGroupStat }) {
  const { t } = useTranslation('analytics');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.groupRow} testID={`channel-group-${stat.label}`}>
      <Text style={styles.groupLabel} numberOfLines={1}>
        {stat.label}
      </Text>
      <Text style={styles.groupCount}>{stat.applicationCount}</Text>
      <RatioBar
        label={t('responseLabel')}
        percent={stat.responseRate}
        color="#a855f7"
        sampleSize={stat.applicationCount}
      />
      <RatioBar
        label={t('cards.offers')}
        percent={stat.offerRate}
        color="#22c55e"
        sampleSize={stat.applicationCount}
      />
    </View>
  );
}

export function ApplicationChannelAnalyticsSection() {
  const { t } = useTranslation('analytics');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data, isLoading } = useApplicationChannelAnalytics();

  if (isLoading) return <ActivityIndicator color={colors.primary} />;
  if (!data) return null;

  return (
    <AnalyticsCard
      title={t('cards.channelsAndTags')}
      description={t('cards.channelsAndTagsDescription')}
      testID="application-channel-analytics-section"
    >
      <Text style={styles.subheading}>{t('bySource')}</Text>
      {data.bySource.length === 0 ? (
        <Text style={styles.empty}>{t('noSourcesTracked')}</Text>
      ) : (
        data.bySource.map((stat) => <GroupRow key={stat.label} stat={stat} />)
      )}

      <Text style={styles.subheading}>{t('byTag')}</Text>
      {data.byTag.length === 0 ? (
        <Text style={styles.empty}>{t('noTagsUsed')}</Text>
      ) : (
        data.byTag.map((stat) => <GroupRow key={stat.label} stat={stat} />)
      )}
    </AnalyticsCard>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    subheading: { fontSize: 11, fontWeight: '600', color: colors.textSubtle, marginTop: 8 },
    empty: { fontSize: 12, color: colors.textFaint },
    groupRow: {
      gap: 2,
      borderTopWidth: 1,
      borderTopColor: colors.surfaceAlt,
      paddingTop: 6,
      marginTop: 4,
    },
    groupLabel: { fontSize: 13, fontWeight: '600', color: colors.text },
    groupCount: { fontSize: 10, color: colors.textFaint },
  });
}
