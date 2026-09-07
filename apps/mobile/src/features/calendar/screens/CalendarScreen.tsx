import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useCalendarEvents } from '../hooks/useCalendarQueries';
import { buildGrid, dateFromDayKey, dayKey, goToPeriod } from '../lib/calendarGrid';
import { getErrorMessage } from '../../../lib/errors';
import type { CalendarEvent, CalendarEventKind, CalendarViewMode } from '../types';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import { useLanguage } from '../../../i18n/LanguageContext';

function eventDotColor(colors: ThemeColors): Record<CalendarEventKind, string> {
  return {
    applied: colors.primary,
    followUp: '#f59e0b',
    interview: '#a855f7',
  };
}

function weekdayLabels(locale: string): string[] {
  // Jan 4, 2026 is a Sunday — used purely as a stable weekday-index anchor.
  return Array.from({ length: 7 }, (_, i) =>
    new Date(2026, 0, 4 + i).toLocaleDateString(locale, { weekday: 'short' }),
  );
}

function periodLabel(
  viewMode: CalendarViewMode,
  anchor: Date,
  grid: Date[],
  locale: string,
): string {
  if (viewMode === 'month') {
    return anchor.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  }
  if (viewMode === 'week') {
    const start = grid[0].toLocaleDateString(locale, { month: 'short', day: 'numeric' });
    const end = grid[6].toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return `${start} – ${end}`;
  }
  return anchor.toLocaleDateString(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function CalendarScreen() {
  const { t } = useTranslation('calendar');
  const { resolvedLanguage } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const eventDotColorMap = useMemo(() => eventDotColor(colors), [colors]);
  const weekdayLabelList = useMemo(() => weekdayLabels(resolvedLanguage), [resolvedLanguage]);
  const EVENT_LABEL: Record<CalendarEventKind, string> = {
    applied: t('eventLabel.applied'),
    followUp: t('eventLabel.followUp'),
    interview: t('eventLabel.interview'),
  };
  const VIEW_MODES: { mode: CalendarViewMode; label: string }[] = [
    { mode: 'month', label: t('viewModes.month') },
    { mode: 'week', label: t('viewModes.week') },
    { mode: 'day', label: t('viewModes.day') },
  ];
  const router = useRouter();
  const { data: events, isLoading, isError, error, refetch } = useCalendarEvents();

  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [anchorDate, setAnchorDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events ?? []) {
      const key = dayKey(new Date(e.date));
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  }, [events]);

  const grid = useMemo(() => buildGrid(viewMode, anchorDate), [viewMode, anchorDate]);

  const today = dayKey(new Date());
  const anchorDayKey = dayKey(anchorDate);
  const dayInFocus = viewMode === 'day' ? anchorDayKey : selectedDay;
  const focusedEvents = dayInFocus ? (eventsByDay.get(dayInFocus) ?? []) : [];

  const changePeriod = (delta: number) => {
    setAnchorDate((prev) => goToPeriod(viewMode, prev, delta));
    setSelectedDay(null);
  };

  const changeViewMode = (mode: CalendarViewMode) => {
    if (mode === 'day' && selectedDay) setAnchorDate(dateFromDayKey(selectedDay));
    setViewMode(mode);
    setSelectedDay(null);
  };

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <View style={styles.viewModeRow}>
          {VIEW_MODES.map(({ mode, label }) => (
            <Pressable
              key={mode}
              style={[styles.viewModeChip, viewMode === mode && styles.viewModeChipActive]}
              onPress={() => changeViewMode(mode)}
              testID={`calendar-view-${mode}`}
            >
              <Text style={[styles.viewModeText, viewMode === mode && styles.viewModeTextActive]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.periodRow}>
          <Pressable onPress={() => changePeriod(-1)} testID="calendar-previous-period" hitSlop={8}>
            <Text style={styles.periodArrow}>‹</Text>
          </Pressable>
          <Text style={styles.periodLabel}>
            {periodLabel(viewMode, anchorDate, grid, resolvedLanguage)}
          </Text>
          <Pressable onPress={() => changePeriod(1)} testID="calendar-next-period" hitSlop={8}>
            <Text style={styles.periodArrow}>›</Text>
          </Pressable>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator style={styles.loading} size="large" color={colors.primary} />
      ) : isError ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{getErrorMessage(error)}</Text>
          <Pressable onPress={() => void refetch()}>
            <Text style={styles.link}>{t('retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {viewMode !== 'day' && (
            <>
              <View style={styles.weekdayRow}>
                {weekdayLabelList.map((label, i) => (
                  <Text key={`${label}-${i}`} style={styles.weekdayLabel}>
                    {label}
                  </Text>
                ))}
              </View>
              <View style={styles.grid}>
                {grid.map((date) => {
                  const key = dayKey(date);
                  const inMonth = viewMode === 'week' || date.getMonth() === anchorDate.getMonth();
                  const dayEvents = eventsByDay.get(key) ?? [];
                  const eventTypes = [...new Set(dayEvents.map((e) => e.type))];
                  const isToday = key === today;
                  const isSelected = key === selectedDay;
                  return (
                    <Pressable
                      key={key}
                      style={[styles.dayCell, isSelected && styles.dayCellSelected]}
                      onPress={() => setSelectedDay(key === selectedDay ? null : key)}
                      testID={`calendar-day-${key}`}
                    >
                      <Text
                        style={[
                          styles.dayNumber,
                          !inMonth && styles.dayNumberDim,
                          isToday && styles.dayNumberToday,
                        ]}
                      >
                        {date.getDate()}
                      </Text>
                      {eventTypes.length > 0 && (
                        <View style={styles.dotRow}>
                          {eventTypes.map((type) => (
                            <View
                              key={type}
                              style={[styles.dot, { backgroundColor: eventDotColorMap[type] }]}
                            />
                          ))}
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          <View style={styles.eventsSection}>
            {!dayInFocus && <Text style={styles.hintText}>{t('selectDayHint')}</Text>}
            {dayInFocus && focusedEvents.length === 0 && (
              <Text style={styles.hintText}>{t('noEventsOnDay')}</Text>
            )}
            {dayInFocus &&
              focusedEvents.map((event) => (
                <Pressable
                  key={event.id}
                  style={styles.eventRow}
                  onPress={() => router.push(`./applications/${event.applicationId}`)}
                  testID={`calendar-event-${event.id}`}
                >
                  <View style={[styles.dot, { backgroundColor: eventDotColorMap[event.type] }]} />
                  <View style={styles.eventText}>
                    <Text style={styles.eventTitle}>
                      {event.type === 'interview' && event.interviewRoundType
                        ? t('eventTitleWithRound', {
                            label: EVENT_LABEL[event.type],
                            round: event.interviewRoundType,
                            company: event.company,
                          })
                        : t('eventTitlePlain', {
                            label: EVENT_LABEL[event.type],
                            company: event.company,
                          })}
                    </Text>
                    <Text style={styles.eventRole}>{event.role}</Text>
                  </View>
                </Pressable>
              ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    toolbar: {
      padding: 16,
      gap: 12,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    viewModeRow: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceAlt,
      borderRadius: 8,
      padding: 3,
    },
    viewModeChip: {
      flex: 1,
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
    },
    viewModeChipActive: { backgroundColor: colors.surface },
    viewModeText: {
      fontSize: 13,
      color: colors.textSubtle,
      fontWeight: '500',
      textAlign: 'center',
    },
    viewModeTextActive: { color: colors.text },
    periodRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
    periodArrow: { fontSize: 22, color: colors.textMuted, paddingHorizontal: 8 },
    periodLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textMuted,
      minWidth: 160,
      textAlign: 'center',
    },
    loading: { marginTop: 40 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
    error: { color: colors.danger, fontSize: 14, textAlign: 'center' },
    link: { color: colors.primary, fontSize: 13, fontWeight: '600' },
    scrollContent: { padding: 12, paddingBottom: 40 },
    weekdayRow: { flexDirection: 'row' },
    weekdayLabel: {
      flex: 1,
      textAlign: 'center',
      fontSize: 11,
      fontWeight: '600',
      color: colors.textFaint,
      paddingVertical: 4,
    },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    dayCell: {
      width: '14.2857%',
      aspectRatio: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      borderRadius: 8,
    },
    dayCellSelected: { backgroundColor: colors.primarySurface },
    dayNumber: { fontSize: 13, color: colors.textMuted },
    dayNumberDim: { color: colors.borderStrong },
    dayNumberToday: { fontWeight: '700', color: colors.primary },
    dotRow: { flexDirection: 'row', gap: 2 },
    dot: { width: 6, height: 6, borderRadius: 3 },
    eventsSection: { marginTop: 16, gap: 8 },
    hintText: { textAlign: 'center', color: colors.textFaint, fontSize: 13, paddingVertical: 16 },
    eventRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 12,
    },
    eventText: { flex: 1, gap: 2 },
    eventTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
    eventRole: { fontSize: 12, color: colors.textSubtle },
  });
}
