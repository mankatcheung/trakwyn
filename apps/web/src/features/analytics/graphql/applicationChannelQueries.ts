import { queryOptions } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { graphql } from '#/graphql/generated';

const APPLICATION_CHANNEL_ANALYTICS_QUERY = graphql(`
  query ApplicationChannelAnalytics {
    applicationChannelAnalytics {
      bySource {
        label
        applicationCount
        respondedCount
        responseRate
        offerCount
        offerRate
      }
      byTag {
        label
        applicationCount
        respondedCount
        responseRate
        offerCount
        offerRate
      }
    }
  }
`);

export interface ApplicationGroupStat {
  label: string;
  applicationCount: number;
  respondedCount: number;
  responseRate: number;
  offerCount: number;
  offerRate: number;
}

export interface ApplicationChannelAnalytics {
  bySource: ApplicationGroupStat[];
  byTag: ApplicationGroupStat[];
}

export const applicationChannelAnalyticsQueryOptions = queryOptions({
  queryKey: ['applicationChannelAnalytics'],
  queryFn: async () =>
    (await gqlClient.request(APPLICATION_CHANNEL_ANALYTICS_QUERY)) as {
      applicationChannelAnalytics: ApplicationChannelAnalytics;
    },
});
