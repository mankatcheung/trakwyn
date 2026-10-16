import { useQuery } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import { INTERVIEW_QUESTIONS_QUERY } from '../graphql/operations';
import type { InterviewQuestion } from '../types';

export const interviewQuestionsQueryKey = (roundId: string) =>
  ['interviewQuestions', roundId] as const;

export function useInterviewQuestions(roundId: string) {
  return useQuery({
    queryKey: interviewQuestionsQueryKey(roundId),
    queryFn: () =>
      gqlRequest<{ interviewQuestions: InterviewQuestion[] }>(INTERVIEW_QUESTIONS_QUERY, {
        interviewRoundId: roundId,
      }).then((data) => data.interviewQuestions),
    enabled: Boolean(roundId),
  });
}
