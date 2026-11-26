import type { CalendarEventKind } from '../graphql/calendarQueries';

/** The dot each kind of event wears on the grid, in the list and in the legend. */
export const EVENT_DOT_STYLES: Record<CalendarEventKind, string> = {
  applied: 'bg-blue-500',
  followUp: 'bg-amber-500',
  interview: 'bg-purple-500',
};

/** The order the legend names them in. */
export const EVENT_KINDS: CalendarEventKind[] = ['applied', 'followUp', 'interview'];
