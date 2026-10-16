import { useQuery } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import { MOCK_INTERVIEW_QUESTIONS_QUERY } from '../graphql/operations';
import type { MockInterviewQuestion } from '../types';

export const mockInterviewQuestionsQueryKey = (roundId: string) =>
  ['mockInterviewQuestions', roundId] as const;

export function useMockInterviewQuestions(roundId: string) {
  return useQuery({
    queryKey: mockInterviewQuestionsQueryKey(roundId),
    queryFn: () =>
      gqlRequest<{ mockInterviewQuestions: MockInterviewQuestion[] }>(
        MOCK_INTERVIEW_QUESTIONS_QUERY,
        { interviewRoundId: roundId },
      ).then((data) => data.mockInterviewQuestions),
    enabled: Boolean(roundId),
  });
}
