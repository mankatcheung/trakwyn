import { createFileRoute } from '@tanstack/react-router';
import { analyticsQueryOptions } from './-analytics-queries';
import { AnalyticsPage } from './-analytics-page';

export const Route = createFileRoute('/_authenticated/analytics')({
  loader: ({ context: { queryClient } }) =>
    queryClient.query({ ...analyticsQueryOptions, staleTime: 'static' }),
  component: AnalyticsPage,
});
