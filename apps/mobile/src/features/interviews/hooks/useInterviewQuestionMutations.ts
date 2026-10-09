import { useMutation, useQueryClient } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import {
  CREATE_INTERVIEW_QUESTION_MUTATION,
  DELETE_INTERVIEW_QUESTION_MUTATION,
  REORDER_INTERVIEW_QUESTIONS_MUTATION,
  UPDATE_INTERVIEW_QUESTION_MUTATION,
} from '../graphql/operations';
import { interviewRoundsQueryKey } from './useInterviewQueries';
import { interviewQuestionsQueryKey } from './useInterviewQuestionQueries';
import type { InterviewQuestion, InterviewQuestionFormData } from '../types';

/**
 * Create and delete move the round's `questionCount`, which the rounds list
 * shows on each card, so they refresh both. Edits and reorders leave the count
 * alone and refresh only the questions.
 */
function useRefreshers(applicationId: string, roundId: string) {
  const qc = useQueryClient();
  return {
    refreshQuestions: () => qc.invalidateQueries({ queryKey: interviewQuestionsQueryKey(roundId) }),
    refreshQuestionsAndCount: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: interviewQuestionsQueryKey(roundId) }),
        qc.invalidateQueries({ queryKey: interviewRoundsQueryKey(applicationId) }),
      ]),
  };
}

export function useCreateInterviewQuestion(applicationId: string, roundId: string) {
  const { refreshQuestionsAndCount } = useRefreshers(applicationId, roundId);
  return useMutation({
    mutationFn: (data: InterviewQuestionFormData) =>
      gqlRequest<{ createInterviewQuestion: InterviewQuestion }>(
        CREATE_INTERVIEW_QUESTION_MUTATION,
        {
          input: {
            interviewRoundId: roundId,
            question: data.question,
            // Leave the answer out rather than sending '', which would be stored as "answered".
            ...(data.answer.trim() ? { answer: data.answer } : {}),
          },
        },
      ),
    onSuccess: refreshQuestionsAndCount,
  });
}

export function useUpdateInterviewQuestion(applicationId: string, roundId: string) {
  const { refreshQuestions } = useRefreshers(applicationId, roundId);
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: InterviewQuestionFormData }) =>
      gqlRequest<{ updateInterviewQuestion: InterviewQuestion }>(
        UPDATE_INTERVIEW_QUESTION_MUTATION,
        {
          id,
          input: { question: data.question, answer: data.answer.trim() ? data.answer : null },
        },
      ),
    onSuccess: refreshQuestions,
  });
}

export function useDeleteInterviewQuestion(applicationId: string, roundId: string) {
  const { refreshQuestionsAndCount } = useRefreshers(applicationId, roundId);
  return useMutation({
    mutationFn: (id: string) => gqlRequest(DELETE_INTERVIEW_QUESTION_MUTATION, { id }),
    onSuccess: refreshQuestionsAndCount,
  });
}

export function useReorderInterviewQuestions(applicationId: string, roundId: string) {
  const qc = useQueryClient();
  const { refreshQuestions } = useRefreshers(applicationId, roundId);
  return useMutation({
    mutationFn: (orderedIds: string[]) =>
      gqlRequest<{ reorderInterviewQuestions: InterviewQuestion[] }>(
        REORDER_INTERVIEW_QUESTIONS_MUTATION,
        { interviewRoundId: roundId, orderedIds },
      ),
    // Show the new order straight away; the refetch afterwards settles it.
    onMutate: async (orderedIds) => {
      await qc.cancelQueries({ queryKey: interviewQuestionsQueryKey(roundId) });
      const previous = qc.getQueryData<InterviewQuestion[]>(interviewQuestionsQueryKey(roundId));
      qc.setQueryData<InterviewQuestion[]>(interviewQuestionsQueryKey(roundId), (old) =>
        orderedIds
          .map((id) => old?.find((q) => q.id === id))
          .filter((q): q is InterviewQuestion => q !== undefined),
      );
      return { previous };
    },
    onError: (_err, _ids, context) => {
      if (context?.previous) {
        qc.setQueryData(interviewQuestionsQueryKey(roundId), context.previous);
      }
    },
    onSettled: refreshQuestions,
  });
}
