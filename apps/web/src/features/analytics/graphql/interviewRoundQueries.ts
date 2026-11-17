import { queryOptions } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';

const INTERVIEW_ROUND_ANALYTICS_QUERY = `
  query InterviewRoundAnalytics {
    interviewRoundAnalytics {
      byType {
        type
        passed
        failed
        pending
        cancelled
      }
      roundsToOffer {
        average
        median
        sampleSize
      }
      roundsToRejection {
        average
        median
        sampleSize
      }
    }
  }
`;

export interface InterviewRoundTypeStat {
  type: string;
  passed: number;
  failed: number;
  pending: number;
  cancelled: number;
}

export interface RoundsToTerminalStat {
  average: number | null;
  median: number | null;
  sampleSize: number;
}

export interface InterviewRoundAnalytics {
  byType: InterviewRoundTypeStat[];
  roundsToOffer: RoundsToTerminalStat;
  roundsToRejection: RoundsToTerminalStat;
}

export const interviewRoundAnalyticsQueryOptions = queryOptions({
  queryKey: ['interviewRoundAnalytics'],
  queryFn: () =>
    gqlClient.request<{ interviewRoundAnalytics: InterviewRoundAnalytics }>(
      INTERVIEW_ROUND_ANALYTICS_QUERY,
    ),
});
