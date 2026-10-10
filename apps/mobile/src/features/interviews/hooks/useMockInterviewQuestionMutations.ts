import { useMutation, useQueryClient } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import {
  CREATE_MOCK_INTERVIEW_QUESTION_MUTATION,
  DELETE_MOCK_INTERVIEW_QUESTION_MUTATION,
  GENERATE_MOCK_INTERVIEW_ANSWER_MUTATION,
  GENERATE_MOCK_INTERVIEW_QUESTIONS_MUTATION,
  REORDER_MOCK_INTERVIEW_QUESTIONS_MUTATION,
  UPDATE_MOCK_INTERVIEW_QUESTION_MUTATION,
} from '../graphql/operations';
import { interviewRoundsQueryKey } from './useInterviewQueries';
import { mockInterviewQuestionsQueryKey } from './useMockInterviewQuestionQueries';
import {
  MOCK_QUESTION_LIMITS,
  type GeneratedMockAnswer,
  type GeneratedMockQuestions,
  type InterviewQuestionFormData,
  type MockInterviewQuestion,
} from '../types';

/**
 * Create and delete move the round's `mockQuestionCount`, which the rounds list
 * shows on each card, so they refresh both. Edits and reorders leave the count
 * alone and refresh only the questions.
 */
function useRefreshers(applicationId: string, roundId: string) {
  const qc = useQueryClient();
  return {
    refreshQuestions: () =>
      qc.invalidateQueries({ queryKey: mockInterviewQuestionsQueryKey(roundId) }),
    refreshQuestionsAndCount: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: mockInterviewQuestionsQueryKey(roundId) }),
        qc.invalidateQueries({ queryKey: interviewRoundsQueryKey(applicationId) }),
      ]),
  };
}

export function useCreateMockInterviewQuestion(applicationId: string, roundId: string) {
  const { refreshQuestionsAndCount } = useRefreshers(applicationId, roundId);
  return useMutation({
    mutationFn: (data: InterviewQuestionFormData) =>
      gqlRequest<{ createMockInterviewQuestion: MockInterviewQuestion }>(
        CREATE_MOCK_INTERVIEW_QUESTION_MUTATION,
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

/**
 * Saves the suggestions the user kept. One at a time: each create reserves a
 * quota slot, so parallel calls would race the limit instead of failing cleanly.
 */
export function useAddMockInterviewQuestions(applicationId: string, roundId: string) {
  const { refreshQuestionsAndCount } = useRefreshers(applicationId, roundId);
  return useMutation({
    mutationFn: async (questions: string[]) => {
      for (const question of questions) {
        await gqlRequest(CREATE_MOCK_INTERVIEW_QUESTION_MUTATION, {
          input: { interviewRoundId: roundId, question },
        });
      }
    },
    // Settled, not just success: a failure part-way leaves some saved.
    onSettled: refreshQuestionsAndCount,
  });
}

/**
 * Editing sends no `answerSource`, so an AI answer keeps its label. Pass
 * `answerSource: 'ai'` only when saving an AI draft.
 */
export function useUpdateMockInterviewQuestion(applicationId: string, roundId: string) {
  const { refreshQuestions } = useRefreshers(applicationId, roundId);
  return useMutation({
    mutationFn: ({
      id,
      data,
      answerSource,
    }: {
      id: string;
      data: InterviewQuestionFormData;
      answerSource?: 'ai';
    }) =>
      gqlRequest<{ updateMockInterviewQuestion: MockInterviewQuestion }>(
        UPDATE_MOCK_INTERVIEW_QUESTION_MUTATION,
        {
          id,
          input: {
            question: data.question,
            answer: data.answer.trim() ? data.answer : null,
            ...(answerSource ? { answerSource } : {}),
          },
        },
      ),
    onSuccess: refreshQuestions,
  });
}

export function useDeleteMockInterviewQuestion(applicationId: string, roundId: string) {
  const { refreshQuestionsAndCount } = useRefreshers(applicationId, roundId);
  return useMutation({
    mutationFn: (id: string) => gqlRequest(DELETE_MOCK_INTERVIEW_QUESTION_MUTATION, { id }),
    onSuccess: refreshQuestionsAndCount,
  });
}

export function useReorderMockInterviewQuestions(applicationId: string, roundId: string) {
  const qc = useQueryClient();
  const { refreshQuestions } = useRefreshers(applicationId, roundId);
  return useMutation({
    mutationFn: (orderedIds: string[]) =>
      gqlRequest<{ reorderMockInterviewQuestions: MockInterviewQuestion[] }>(
        REORDER_MOCK_INTERVIEW_QUESTIONS_MUTATION,
        { interviewRoundId: roundId, orderedIds },
      ),
    // Show the new order straight away; the refetch afterwards settles it.
    onMutate: async (orderedIds) => {
      await qc.cancelQueries({ queryKey: mockInterviewQuestionsQueryKey(roundId) });
      const previous = qc.getQueryData<MockInterviewQuestion[]>(
        mockInterviewQuestionsQueryKey(roundId),
      );
      qc.setQueryData<MockInterviewQuestion[]>(mockInterviewQuestionsQueryKey(roundId), (old) =>
        orderedIds
          .map((id) => old?.find((q) => q.id === id))
          .filter((q): q is MockInterviewQuestion => q !== undefined),
      );
      return { previous };
    },
    onError: (_err, _ids, context) => {
      if (context?.previous) {
        qc.setQueryData(mockInterviewQuestionsQueryKey(roundId), context.previous);
      }
    },
    onSettled: refreshQuestions,
  });
}

/** Asks the AI for suggestions. Nothing is saved: the screen decides what to keep. */
export function useGenerateMockInterviewQuestions(roundId: string) {
  return useMutation({
    mutationFn: (prompt: string) =>
      gqlRequest<{ generateMockInterviewQuestions: GeneratedMockQuestions }>(
        GENERATE_MOCK_INTERVIEW_QUESTIONS_MUTATION,
        {
          interviewRoundId: roundId,
          prompt: prompt.trim() || null,
          count: MOCK_QUESTION_LIMITS.GENERATE_COUNT,
        },
      ).then((data) => data.generateMockInterviewQuestions),
  });
}

/** Drafts an answer to one practice question. A draft only: saving is a separate step. */
export function useGenerateMockInterviewAnswer() {
  return useMutation({
    mutationFn: (questionId: string) =>
      gqlRequest<{ generateMockInterviewAnswer: GeneratedMockAnswer }>(
        GENERATE_MOCK_INTERVIEW_ANSWER_MUTATION,
        { mockInterviewQuestionId: questionId },
      ).then((data) => data.generateMockInterviewAnswer),
  });
}
