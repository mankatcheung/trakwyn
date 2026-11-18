import { queryOptions } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { graphql } from '#/graphql/generated';
import type { ApplicationStatus } from '#/graphql/generated/graphql';

const ANALYTICS_QUERY = graphql(`
  query AnalyticsApplications {
    applications {
      id
      company
      role
      status
      appliedAt
      createdAt
      likelyGhosted
    }
  }
`);

export type AnalyticsApplication = {
  id: string;
  company: string;
  role: string;
  status: ApplicationStatus;
  appliedAt?: string | null;
  createdAt: string;
  likelyGhosted: boolean;
};

// Kept in its own module (no recharts import) so the analytics route's
// loader can prefetch this without pulling the lazy-loaded chart
// component's much heavier dependency into the eagerly-loaded route chunk.
export const analyticsQueryOptions = queryOptions({
  queryKey: ['analytics'],
  queryFn: async () =>
    (await gqlClient.request(ANALYTICS_QUERY)) as { applications: AnalyticsApplication[] },
});
