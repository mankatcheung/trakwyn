import { createFileRoute } from '@tanstack/react-router';
import { analyticsQueryOptions } from '../../features/analytics/graphql/analyticsQueries';
import { AnalyticsPage } from '../../features/analytics/pages/AnalyticsPage';

export const Route = createFileRoute('/_authenticated/analytics')({
  loader: ({ context: { queryClient } }) =>
    queryClient.query({ ...analyticsQueryOptions, staleTime: 'static' }),
  component: AnalyticsPage,
});
