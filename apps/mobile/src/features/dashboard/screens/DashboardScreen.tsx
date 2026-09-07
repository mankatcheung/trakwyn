import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useApplications } from '../../applications/hooks/useApplicationQueries';
import { useDashboardCalendarEvents, useWeeklyApplicationGoal } from '../hooks/useDashboardQueries';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../../applications/components/StatusBadge';
import { getErrorMessage } from '../../../lib/errors';
import type { CalendarEvent, CalendarEventKind } from '../types';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function DashboardScreen() {
  const { t } = useTranslation('dashboard');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { data: applications, isLoading, isError, error } = useApplications();
  const { data: calendarEvents } = useDashboardCalendarEvents();
  const { data: goal } = useWeeklyApplicationGoal();

  const EVENT_LABEL: Record<CalendarEventKind, string> = {
    interview: t('eventLabel.interview'),
    followUp: t('eventLabel.followUp'),
    applied: t('eventLabel.applied'),
  };

  const apps = applications ?? [];
  const now = new Date();
  const counts = {
    total: apps.length,
    applied: apps.filter((a) => a.status === 'applied').length,
    interviewing: apps.filter((a) => a.status === 'interviewing').length,
    offered: apps.filter((a) => a.status === 'offered').length,
    overdue: apps.filter((a) => a.followUpAt && new Date(a.followUpAt) <= now).length,
  };

  const upcomingEvents: CalendarEvent[] = (calendarEvents ?? [])
    .filter((e) => e.type !== 'applied' && new Date(e.date) >= now)
    .slice(0, 5);

  const recentApps = apps.slice(0, 8);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('title')}</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.statsRow}
      >
        <StatCard
          label={t('stats.total')}
          value={counts.total}
          loading={isLoading}
          color={colors.primary}
        />
        <StatCard
          label={t('stats.applied')}
          value={counts.applied}
          loading={isLoading}
          color="#4f46e5"
        />
        <StatCard
          label={t('stats.interviewing')}
          value={counts.interviewing}
          loading={isLoading}
          color="#b45309"
        />
        <StatCard
          label={t('stats.offered')}
          value={counts.offered}
          loading={isLoading}
          color="#15803d"
        />
        <StatCard
          label={t('stats.followUpDue')}
          value={counts.overdue}
          loading={isLoading}
          color="#c2410c"
        />
      </ScrollView>

      {goal && (
        <View style={styles.goalCard} testID="weekly-goal-card">
          <View style={styles.goalHeaderRow}>
            <View style={styles.goalHeaderText}>
              <Text style={styles.goalTitle}>{t('goal.title')}</Text>
              <Text style={styles.goalProgress}>
                {t('goal.progress', {
                  current: goal.currentWeekCount,
                  goal: goal.weeklyApplicationGoal,
                })}
              </Text>
            </View>
            <Text style={styles.goalStreak}>{t('goal.streak', { count: goal.streakWeeks })}</Text>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.min(
                    100,
                    (goal.currentWeekCount / Math.max(1, goal.weeklyApplicationGoal)) * 100,
                  )}%`,
                },
              ]}
            />
          </View>
        </View>
      )}

      {upcomingEvents.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>{t('upcoming.title')}</Text>
            <Pressable
              onPress={() => router.push('/(tabs)/calendar')}
              testID="dashboard-view-calendar"
            >
              <Text style={styles.link}>{t('upcoming.viewCalendar')}</Text>
            </Pressable>
          </View>
          {upcomingEvents.map((event) => (
            <Pressable
              key={event.id}
              style={styles.eventRow}
              onPress={() => router.push(`./applications/${event.applicationId}`)}
              testID={`upcoming-event-${event.id}`}
            >
              <Text style={styles.eventMeta}>
                {EVENT_LABEL[event.type]} · {formatEventDate(event.date)}
              </Text>
              <Text style={styles.eventCompany}>{event.company}</Text>
              <Text style={styles.eventRole}>{event.role}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('recent.title')}</Text>
        {isLoading ? (
          <ActivityIndicator style={styles.loading} size="large" color={colors.primary} />
        ) : isError ? (
          <Text style={styles.error}>{getErrorMessage(error)}</Text>
        ) : recentApps.length === 0 ? (
          <Pressable onPress={() => router.push('./applications/new')}>
            <Text style={styles.emptyText}>{t('recent.empty')}</Text>
          </Pressable>
        ) : (
          recentApps.map((app) => {
            const isOverdue = app.followUpAt && new Date(app.followUpAt) <= now;
            return (
              <Pressable
                key={app.id}
                style={styles.appRow}
                onPress={() => router.push(`./applications/${app.id}`)}
                testID={`recent-application-${app.id}`}
              >
                <View style={styles.appRowText}>
                  <Text style={styles.appCompany}>
                    {app.starred ? '★ ' : ''}
                    {isOverdue ? '⚠ ' : ''}
                    {app.company}
                  </Text>
                  <Text style={styles.appRole}>{app.role}</Text>
                </View>
                <StatusBadge status={app.status} />
              </Pressable>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, gap: 24, paddingBottom: 40 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { fontSize: 22, fontWeight: '700', color: colors.text },
    statsRow: { gap: 10 },
    goalCard: {
      borderRadius: 12,
      backgroundColor: colors.primarySurface,
      borderWidth: 1,
      borderColor: colors.primarySurface,
      padding: 16,
      gap: 12,
    },
    goalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    goalHeaderText: { flex: 1, gap: 2 },
    goalTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
    goalProgress: { fontSize: 13, color: colors.textMuted },
    goalStreak: { fontSize: 13, fontWeight: '700', color: colors.primary },
    progressTrack: {
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primarySurface,
      overflow: 'hidden',
    },
    progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 4 },
    section: { gap: 10 },
    sectionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
    link: { color: colors.primary, fontSize: 13, fontWeight: '600' },
    eventRow: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 12,
      gap: 2,
    },
    eventMeta: { fontSize: 11, color: colors.textSubtle, fontWeight: '600' },
    eventCompany: { fontSize: 14, fontWeight: '600', color: colors.text },
    eventRole: { fontSize: 12, color: colors.textSubtle },
    loading: { marginTop: 16 },
    error: { color: colors.danger, fontSize: 13 },
    emptyText: { color: colors.primary, fontSize: 13 },
    appRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 12,
    },
    appRowText: { flex: 1, gap: 2, marginRight: 8 },
    appCompany: { fontSize: 14, fontWeight: '600', color: colors.text },
    appRole: { fontSize: 12, color: colors.textSubtle },
  });
}
