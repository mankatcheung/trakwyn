import { queryOptions } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';

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

export type CalendarEventKind = 'applied' | 'followUp' | 'interview';

export interface CalendarEvent {
  id: string;
  applicationId: string;
  company: string;
  role: string;
  type: CalendarEventKind;
  date: string;
  interviewRoundType: string | null;
}

export const calendarEventsQueryOptions = queryOptions({
  // Distinct from dashboard.tsx's ['calendarEvents'] key (same-shaped data,
  // different query) — sharing a key meant this page's loader could serve
  // the dashboard widget's stale cached result (60s default staleTime)
  // instead of fetching fresh data, hiding events created in between.
  queryKey: ['calendarEvents', 'page'],
  queryFn: () => gqlClient.request<{ calendarEvents: CalendarEvent[] }>(CALENDAR_EVENTS_QUERY),
});
