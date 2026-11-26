import type { CalendarEventKind } from '../graphql/calendarQueries';
import { EVENT_DOT_STYLES, EVENT_KINDS } from '../lib/eventStyles';

/** Names the dots on the grid, which otherwise mean nothing until a day is opened (JEF-693). */
export function CalendarLegend({ labels }: { labels: Record<CalendarEventKind, string> }) {
  return (
    <ul
      data-testid="calendar-legend"
      className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500 dark:text-stone-400"
    >
      {EVENT_KINDS.map((kind) => (
        <li key={kind} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={`size-1.5 rounded-full ${EVENT_DOT_STYLES[kind]}`} />
          {labels[kind]}
        </li>
      ))}
    </ul>
  );
}
