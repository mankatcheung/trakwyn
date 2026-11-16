import { createFileRoute, Link } from '@tanstack/react-router';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { gqlClient } from '#/graphql/client';
import { ErrorState } from '#/components/ErrorState';
import { useLocale } from '#/lib/i18n';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Skeleton } from '@trakwyn/ui';

const CALENDAR_EVENTS_QUERY = `
  query CalendarEvents {
    calendarEvents {
      id
      applicationId
      company
      role
      type
      date
      interviewRoundType
    }
  }
`;

type CalendarEventKind = 'applied' | 'followUp' | 'interview';
type ViewMode = 'month' | 'week' | 'day';

export interface CalendarEvent {
  id: string;
  applicationId: string;
  company: string;
  role: string;
  type: CalendarEventKind;
  date: string;
  interviewRoundType: string | null;
}

const EVENT_DOT_STYLES: Record<CalendarEventKind, string> = {
  applied: 'bg-blue-500',
  followUp: 'bg-amber-500',
  interview: 'bg-purple-500',
};

// Local calendar day, deliberately not UTC — see JEF-54's timezone decision.
function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dateFromDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function buildMonthGrid(anchor: Date): Date[] {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - firstOfMonth.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

function buildWeekGrid(anchor: Date): Date[] {
  const weekStart = new Date(anchor);
  weekStart.setDate(anchor.getDate() - anchor.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
}

function formatWeekRange(start: Date, end: Date): string {
  const startStr = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const endStr = end.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${startStr} – ${endStr}`;
}

const calendarEventsQueryOptions = queryOptions({
  // Distinct from dashboard.tsx's ['calendarEvents'] key (same-shaped data,
  // different query) — sharing a key meant this page's loader could serve
  // the dashboard widget's stale cached result (60s default staleTime)
  // instead of fetching fresh data, hiding events created in between.
  queryKey: ['calendarEvents', 'page'],
  queryFn: () => gqlClient.request<{ calendarEvents: CalendarEvent[] }>(CALENDAR_EVENTS_QUERY),
});

export const Route = createFileRoute('/_authenticated/calendar')({
  loader: ({ context: { queryClient } }) =>
    queryClient.query({ ...calendarEventsQueryOptions, staleTime: 'static' }),
  component: CalendarPage,
});

function CalendarPage() {
  const { t, locale } = useLocale();
  const EVENT_LABEL: Record<CalendarEventKind, string> = {
    applied: t('status.applied'),
    followUp: t('applicationDetail.followUpLabel'),
    interview: t('dashboard.eventInterview'),
  };
  const WEEKDAY_LABELS = Array.from({ length: 7 }, (_, i) =>
    // Jan 1, 2023 was a Sunday — used purely as a stable weekday-index anchor.
    new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2023, 0, 1 + i)),
  );
  const VIEW_MODES: { mode: ViewMode; label: string }[] = [
    { mode: 'month', label: t('calendarPage.month') },
    { mode: 'week', label: t('calendarPage.week') },
    { mode: 'day', label: t('calendarPage.day') },
  ];
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [anchorDate, setAnchorDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery(calendarEventsQueryOptions);

  const events = data?.calendarEvents;

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

  const grid = useMemo(() => {
    if (viewMode === 'month') return buildMonthGrid(anchorDate);
    if (viewMode === 'week') return buildWeekGrid(anchorDate);
    return [anchorDate];
  }, [viewMode, anchorDate]);

  const today = dayKey(new Date());
  const anchorDayKey = dayKey(anchorDate);
  const dayInFocus = viewMode === 'day' ? anchorDayKey : selectedDay;
  const focusedEvents = dayInFocus ? (eventsByDay.get(dayInFocus) ?? []) : [];

  const goToPeriod = (delta: number) => {
    setAnchorDate((prev) => {
      if (viewMode === 'month') return new Date(prev.getFullYear(), prev.getMonth() + delta, 1);
      const d = new Date(prev);
      d.setDate(prev.getDate() + delta * (viewMode === 'week' ? 7 : 1));
      return d;
    });
    setSelectedDay(null);
  };

  const changeViewMode = (mode: ViewMode) => {
    if (mode === 'day' && selectedDay) {
      setAnchorDate(dateFromDayKey(selectedDay));
    }
    setViewMode(mode);
    setSelectedDay(null);
  };

  const periodLabel =
    viewMode === 'month'
      ? anchorDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : viewMode === 'week'
        ? formatWeekRange(grid[0], grid[6])
        : anchorDate.toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          });

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('nav.calendar')}</h1>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800">
          {VIEW_MODES.map(({ mode, label }) => (
            <button
              key={mode}
              onClick={() => changeViewMode(mode)}
              className={`rounded-md px-3 py-1 text-sm transition-colors ${
                viewMode === mode
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6 flex items-center justify-center gap-2">
        <button
          onClick={() => goToPeriod(-1)}
          aria-label={t('calendarPage.previousPeriod', { period: t(`calendarPage.${viewMode}`) })}
          className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <ChevronLeftIcon size={18} />
        </button>
        <span className="w-48 text-center text-sm font-medium text-gray-700 dark:text-gray-300">
          {periodLabel}
        </span>
        <button
          onClick={() => goToPeriod(1)}
          aria-label={t('calendarPage.nextPeriod', { period: t(`calendarPage.${viewMode}`) })}
          className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <ChevronRightIcon size={18} />
        </button>
      </div>

      {isLoading ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <>
          {viewMode !== 'day' && (
            <>
              <div className="mb-1 grid grid-cols-7 gap-1">
                {WEEKDAY_LABELS.map((d) => (
                  <div
                    key={d}
                    className="py-1 text-center text-xs font-medium text-gray-400 dark:text-gray-500"
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {grid.map((date) => {
                  const key = dayKey(date);
                  const inMonth = viewMode === 'week' || date.getMonth() === anchorDate.getMonth();
                  const dayEvents = eventsByDay.get(key) ?? [];
                  const eventTypes = [...new Set(dayEvents.map((e) => e.type))];
                  const isToday = key === today;
                  const isSelected = key === selectedDay;
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedDay(key === selectedDay ? null : key)}
                      className={`flex aspect-square flex-col items-center gap-1 rounded-lg p-1.5 text-sm transition-colors ${
                        !inMonth
                          ? 'text-gray-300 dark:text-gray-600'
                          : 'text-gray-700 dark:text-gray-300'
                      } ${
                        isSelected
                          ? 'bg-blue-50 ring-1 ring-blue-400 dark:bg-blue-900/20'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                      } ${isToday ? 'font-bold' : ''}`}
                    >
                      <span>{date.getDate()}</span>
                      {eventTypes.length > 0 && (
                        <span className="flex gap-0.5">
                          {eventTypes.map((t) => (
                            <span
                              key={t}
                              className={`size-1.5 rounded-full ${EVENT_DOT_STYLES[t]}`}
                            />
                          ))}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div className="mt-6">
            {!dayInFocus && (
              <p className="py-4 text-center text-sm text-gray-400 dark:text-gray-500">
                {t('calendarPage.selectDayPrompt')}
              </p>
            )}
            {dayInFocus && focusedEvents.length === 0 && (
              <p className="py-4 text-center text-sm text-gray-400 dark:text-gray-500">
                {t('calendarPage.noEventsOnDay')}
              </p>
            )}
            {dayInFocus && focusedEvents.length > 0 && (
              <div className="space-y-2">
                {viewMode !== 'day' && (
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    {dateFromDayKey(dayInFocus).toLocaleDateString(undefined, {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                )}
                {focusedEvents.map((e) => (
                  <Link
                    key={e.id}
                    to="/applications/$applicationId"
                    params={{ applicationId: e.applicationId }}
                    className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
                  >
                    <span className={`size-2 shrink-0 rounded-full ${EVENT_DOT_STYLES[e.type]}`} />
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {EVENT_LABEL[e.type]}
                        {e.type === 'interview' && e.interviewRoundType
                          ? ` (${e.interviewRoundType})`
                          : ''}{' '}
                        — {e.company}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{e.role}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
