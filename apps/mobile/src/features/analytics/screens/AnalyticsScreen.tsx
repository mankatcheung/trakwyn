import React, { useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAnalyticsApplications } from '../hooks/useAnalyticsQueries';
import { buildFunnelData, buildWeeklyData, computeSummaryStats } from '../lib/analyticsSummary';
import { AnalyticsCard } from '../components/AnalyticsCard';
import { WeeklyBarChart } from '../components/WeeklyBarChart';
import { StageFunnelChart } from '../components/StageFunnelChart';
import { DocumentVersionOutcomesSection } from '../components/DocumentVersionOutcomesSection';
import { InterviewRoundAnalyticsSection } from '../components/InterviewRoundAnalyticsSection';
import { OfferAnalyticsSection } from '../components/OfferAnalyticsSection';
import { ApplicationChannelAnalyticsSection } from '../components/ApplicationChannelAnalyticsSection';
import { ResponseTimeAnalyticsSection } from '../components/ResponseTimeAnalyticsSection';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

export function AnalyticsScreen() {
  const { t } = useTranslation('analytics');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data: applications, isLoading, isError, error } = useAnalyticsApplications();

  const apps = useMemo(() => applications ?? [], [applications]);
  const stats = useMemo(() => computeSummaryStats(apps), [apps]);
  const weeklyData = useMemo(() => buildWeeklyData(apps), [apps]);
  const funnelData = useMemo(() => buildFunnelData(apps), [apps]);

  if (isLoading) {
    return <ActivityIndicator style={styles.loading} size="large" color={colors.primary} />;
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{getErrorMessage(error)}</Text>
      </View>
    );
  }

  const statItems = [
    { label: t('stats.total'), value: String(stats.totalApps) },
    { label: t('stats.active'), value: String(stats.activeApps) },
    { label: t('stats.responseRate'), value: `${stats.responseRate}%` },
    { label: t('stats.offerRate'), value: `${stats.successRate}%` },
    { label: t('stats.ghostingRate'), value: `${stats.ghostingRate}%` },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('title')}</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.statsRow}
      >
        {statItems.map((item) => (
          <View key={item.label} style={styles.statCard} testID={`analytics-stat-${item.label}`}>
            <Text style={styles.statValue}>{item.value}</Text>
            <Text style={styles.statLabel}>{item.label}</Text>
          </View>
        ))}
      </ScrollView>

      <AnalyticsCard title={t('cards.applicationsPerWeek')} testID="weekly-applications-card">
        {weeklyData.length === 0 ? (
          <Text style={styles.empty}>{t('noDataYet')}</Text>
        ) : (
          <WeeklyBarChart data={weeklyData} />
        )}
      </AnalyticsCard>

      <AnalyticsCard title={t('cards.stageFunnel')} testID="stage-funnel-card">
        {apps.length === 0 ? (
          <Text style={styles.empty}>{t('noDataYet')}</Text>
        ) : (
          <StageFunnelChart data={funnelData} />
        )}
      </AnalyticsCard>

      <DocumentVersionOutcomesSection />
      <InterviewRoundAnalyticsSection />
      <OfferAnalyticsSection />
      <ApplicationChannelAnalyticsSection />
      <ResponseTimeAnalyticsSection />
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, gap: 16, paddingBottom: 40 },
    title: { fontSize: 22, fontWeight: '700', color: colors.text },
    loading: { marginTop: 40 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSurface,
      borderRadius: 8,
      padding: 10,
      fontSize: 13,
    },
    statsRow: { gap: 10 },
    statCard: {
      width: 100,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      gap: 2,
    },
    statValue: { fontSize: 18, fontWeight: '700', color: colors.text },
    statLabel: { fontSize: 11, color: colors.textSubtle },
    empty: { fontSize: 12, color: colors.textFaint },
  });
}
