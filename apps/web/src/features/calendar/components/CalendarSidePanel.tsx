import { Link } from '@tanstack/react-router';
import { useDates } from '#/hooks/useDates';
import { useLocale } from '#/lib/i18n';
import type { CalendarEvent, CalendarEventKind } from '../graphql/calendarQueries';
import { EVENT_DOT_STYLES } from '../lib/eventStyles';

interface CalendarSidePanelProps {
  /** The day the user picked, as a local `YYYY-MM-DD`, or null. */
  dayInFocus: string | null;
  /** Its date, for the heading above its events. Null in Day view, where the page names it. */
  dayHeadingDate: Date | null;
  focusedEvents: CalendarEvent[];
  /** Events in the next 7 days, shown until a day is picked. */
  upcoming: CalendarEvent[];
  eventLabels: Record<CalendarEventKind, string>;
}

function EventLink({
  event,
  label,
  showDate,
}: {
  event: CalendarEvent;
  label: string;
  showDate: boolean;
}) {
  const dates = useDates();
  return (
    <Link
      to="/applications/$applicationId"
      params={{ applicationId: event.applicationId }}
      className="flex items-center gap-3 rounded-lg border border-stone-200 p-3 transition-colors hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-700"
    >
      <span className={`size-2 shrink-0 rounded-full ${EVENT_DOT_STYLES[event.type]}`} />
      <div className="min-w-0">
        <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
          {label}
          {event.type === 'interview' && event.interviewRoundType
            ? ` (${event.interviewRoundType})`
            : ''}{' '}
          — {event.company}
        </p>
        <p className="truncate text-xs text-stone-500 dark:text-stone-400">
          {showDate ? `${dates.day(event.date)} · ${event.role}` : event.role}
        </p>
      </div>
    </Link>
  );
}

/**
 * Beside the grid on a wide screen and under it on a phone. With no day picked it
 * lists the next 7 days, so the page is useful at a glance (JEF-693); picking a
 * day replaces that with the day's own events.
 */
export function CalendarSidePanel({
  dayInFocus,
  dayHeadingDate,
  focusedEvents,
  upcoming,
  eventLabels,
}: CalendarSidePanelProps) {
  const { t, formatDate } = useLocale();
  const muted = 'py-4 text-center text-sm text-stone-400 dark:text-stone-500';

  if (!dayInFocus) {
    return (
      <div className="space-y-2">
        <h2 className="text-sm font-medium text-stone-500 dark:text-stone-400">
          {t('calendarPage.next7Days')}
        </h2>
        {upcoming.length === 0 ? (
          <p className={muted}>{t('calendarPage.nothingNext7Days')}</p>
        ) : (
          upcoming.map((e) => (
            <EventLink key={e.id} event={e} label={eventLabels[e.type]} showDate />
          ))
        )}
        <p className="pt-2 text-xs text-stone-400 dark:text-stone-500">
          {t('calendarPage.selectDayPrompt')}
        </p>
      </div>
    );
  }

  if (focusedEvents.length === 0) return <p className={muted}>{t('calendarPage.noEventsOnDay')}</p>;

  return (
    <div className="space-y-2">
      {dayHeadingDate && (
        <h2 className="text-sm font-medium text-stone-500 dark:text-stone-400">
          {formatDate(dayHeadingDate, { weekday: 'long', month: 'long', day: 'numeric' })}
        </h2>
      )}
      {focusedEvents.map((e) => (
        <EventLink key={e.id} event={e} label={eventLabels[e.type]} showDate={false} />
      ))}
    </div>
  );
}
