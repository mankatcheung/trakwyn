import { queryOptions } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { graphql } from '#/graphql/generated';

export const RESPONSE_TIME_ANALYTICS_QUERY = graphql(`
  query ResponseTimeAnalytics {
    responseTimeAnalytics {
      timeInStage {
        status
        averageDays
        medianDays
        sampleSize
      }
      timeToFirstResponse {
        averageDays
        medianDays
        sampleSize
      }
    }
  }
`);

export interface StageDurationStat {
  status: string;
  averageDays: number | null;
  medianDays: number | null;
  sampleSize: number;
}

export interface TimeToResponseStat {
  averageDays: number | null;
  medianDays: number | null;
  sampleSize: number;
}

export interface ResponseTimeAnalytics {
  timeInStage: StageDurationStat[];
  timeToFirstResponse: TimeToResponseStat;
}

export const responseTimeAnalyticsQueryOptions = queryOptions({
  queryKey: ['responseTimeAnalytics'],
  queryFn: async () =>
    (await gqlClient.request(RESPONSE_TIME_ANALYTICS_QUERY)) as {
      responseTimeAnalytics: ResponseTimeAnalytics;
    },
});
