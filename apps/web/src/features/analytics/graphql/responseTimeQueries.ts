import { queryOptions } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';

const RESPONSE_TIME_ANALYTICS_QUERY = `
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
`;

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
  queryFn: () =>
    gqlClient.request<{ responseTimeAnalytics: ResponseTimeAnalytics }>(
      RESPONSE_TIME_ANALYTICS_QUERY,
    ),
});
