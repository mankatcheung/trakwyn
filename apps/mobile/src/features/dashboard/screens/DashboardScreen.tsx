import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useApplications } from '../../applications/hooks/useApplicationQueries';
import { useDashboardCalendarEvents, useWeeklyApplicationGoal } from '../hooks/useDashboardQueries';
import { useProfile } from '../../settings/hooks/useProfile';
import { StatCard } from '../components/StatCard';
import {
  AlertCircleIcon,
  BriefcaseIcon,
  CheckCircleIcon,
  ClockIcon,
  DocumentIcon,
} from '../components/DashboardIcons';
import { StatusBadge } from '../../applications/components/StatusBadge';
import { getErrorMessage } from '../../../lib/errors';
import { initialsOf } from '../../../lib/initials';
import type { CalendarEvent, CalendarEventKind } from '../types';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

const STAT_COLORS = {
  blue: { bg: '#eff6ff', fg: '#2563eb' },
  indigo: { bg: '#eef2ff', fg: '#4338ca' },
  amber: { bg: '#fef3c7', fg: '#a16207' },
  green: { bg: '#dcfce7', fg: '#15803d' },
  orange: { bg: '#ffedd5', fg: '#c2410c' },
};

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
  const { data: profile } = useProfile();

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

  const displayName = profile?.name || profile?.email || '';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{t('welcomeBack')}</Text>
          <Text style={styles.title}>{displayName || t('title')}</Text>
        </View>
        {displayName ? (
          <View style={styles.avatar} testID="dashboard-avatar">
            <Text style={styles.avatarText}>{initialsOf(displayName)}</Text>
          </View>
        ) : null}
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
          icon={<BriefcaseIcon color={STAT_COLORS.blue.fg} />}
          iconBg={STAT_COLORS.blue.bg}
        />
        <StatCard
          label={t('stats.applied')}
          value={counts.applied}
          loading={isLoading}
          icon={<DocumentIcon color={STAT_COLORS.indigo.fg} />}
          iconBg={STAT_COLORS.indigo.bg}
        />
        <StatCard
          label={t('stats.interviewing')}
          value={counts.interviewing}
          loading={isLoading}
          icon={<ClockIcon color={STAT_COLORS.amber.fg} />}
          iconBg={STAT_COLORS.amber.bg}
        />
        <StatCard
          label={t('stats.offered')}
          value={counts.offered}
          loading={isLoading}
          icon={<CheckCircleIcon color={STAT_COLORS.green.fg} />}
          iconBg={STAT_COLORS.green.bg}
        />
        <StatCard
          label={t('stats.followUpDue')}
          value={counts.overdue}
          loading={isLoading}
          icon={<AlertCircleIcon color={STAT_COLORS.orange.fg} />}
          iconBg={STAT_COLORS.orange.bg}
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
              style={styles.eventCard}
              onPress={() => router.push(`./applications/${event.applicationId}`)}
              testID={`upcoming-event-${event.id}`}
            >
              <Text style={styles.eventHeadline}>
                {EVENT_LABEL[event.type]} · {formatEventDate(event.date)}
              </Text>
              <Text style={styles.eventSubtext}>
                {event.role} · {event.company}
              </Text>
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
                <View style={styles.appLogo}>
                  <Text style={styles.appLogoText}>{initialsOf(app.company).slice(0, 2)}</Text>
                </View>
                <View style={styles.appRowText}>
                  <Text style={styles.appTitle}>
                    {app.starred ? '★ ' : ''}
                    {isOverdue ? '⚠ ' : ''}
                    {app.role}
                  </Text>
                  <Text style={styles.appSubtitle}>{app.company}</Text>
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
    greeting: { fontSize: 13, color: colors.textSubtle, marginBottom: 2 },
    title: { fontSize: 26, fontWeight: '700', color: colors.text },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    avatarText: { fontSize: 16, fontWeight: '700', color: colors.onPrimary },
    statsRow: { gap: 10 },
    goalCard: {
      borderRadius: 14,
      backgroundColor: colors.primarySurface,
      borderWidth: 1,
      borderColor: colors.primarySurface,
      padding: 16,
      gap: 12,
    },
    goalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    goalHeaderText: { flex: 1, gap: 2 },
    goalTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
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
    sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
    link: { color: colors.primary, fontSize: 13, fontWeight: '600' },
    eventCard: {
      borderRadius: 14,
      backgroundColor: colors.primarySurface,
      borderWidth: 1,
      borderColor: colors.primarySurface,
      padding: 16,
      gap: 4,
    },
    eventHeadline: { fontSize: 16, fontWeight: '700', color: colors.text },
    eventSubtext: { fontSize: 13, color: colors.textMuted },
    loading: { marginTop: 16 },
    error: { color: colors.danger, fontSize: 13 },
    emptyText: { color: colors.primary, fontSize: 13 },
    appRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 12,
      gap: 12,
    },
    appLogo: {
      width: 40,
      height: 40,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceAlt,
      flexShrink: 0,
    },
    appLogoText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
    appRowText: { flex: 1, gap: 2 },
    appTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
    appSubtitle: { fontSize: 13, color: colors.textSubtle },
  });
}
