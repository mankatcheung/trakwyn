import { createFileRoute } from '@tanstack/react-router';
import { calendarEventsQueryOptions } from '../../features/calendar/graphql/calendarQueries';
import { CalendarPage } from '../../features/calendar/pages/CalendarPage';

export const Route = createFileRoute('/_authenticated/calendar')({
  loader: ({ context: { queryClient } }) =>
    queryClient.query({ ...calendarEventsQueryOptions, staleTime: 'static' }),
  component: CalendarPage,
});
