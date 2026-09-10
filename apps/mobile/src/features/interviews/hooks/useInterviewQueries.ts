import { useQuery } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import { INTERVIEW_ROUNDS_QUERY } from '../graphql/operations';
import type { InterviewRound } from '../types';

export const interviewRoundsQueryKey = (applicationId: string) =>
  ['interviewRounds', applicationId] as const;

export function useInterviewRounds(applicationId: string) {
  return useQuery({
    queryKey: interviewRoundsQueryKey(applicationId),
    queryFn: () =>
      gqlRequest<{ interviewRounds: InterviewRound[] }>(INTERVIEW_ROUNDS_QUERY, {
        applicationId,
      }).then((data) => data.interviewRounds),
    enabled: Boolean(applicationId),
  });
}
