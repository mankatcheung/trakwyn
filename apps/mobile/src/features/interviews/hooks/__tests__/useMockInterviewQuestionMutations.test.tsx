import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../../graphql/client', () => ({ gqlRequest: jest.fn() }));

import { gqlRequest } from '../../../../graphql/client';
import {
  useAddMockInterviewQuestions,
  useCreateMockInterviewQuestion,
  useDeleteMockInterviewQuestion,
  useGenerateMockInterviewAnswer,
  useGenerateMockInterviewQuestions,
  useReorderMockInterviewQuestions,
  useUpdateMockInterviewQuestion,
} from '../useMockInterviewQuestionMutations';
import { mockInterviewQuestionsQueryKey } from '../useMockInterviewQuestionQueries';
import { interviewRoundsQueryKey } from '../useInterviewQueries';
import type { MockInterviewQuestion } from '../../types';

const mockedGqlRequest = jest.mocked(gqlRequest);

const question = (id: string): MockInterviewQuestion => ({
  id,
  interviewRoundId: 'round-1',
  question: `Question ${id}`,
  answer: null,
  answerSource: 'user',
  position: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, invalidate, wrapper };
}

const invalidatedKeys = (invalidate: jest.SpyInstance) =>
  invalidate.mock.calls.map(([filters]) => (filters as { queryKey: unknown[] }).queryKey);

describe('useMockInterviewQuestionMutations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('useCreateMockInterviewQuestion', () => {
    it('leaves the answer out when it is blank, and sends no answer source', async () => {
      mockedGqlRequest.mockResolvedValueOnce({ createMockInterviewQuestion: question('q1') });
      const { wrapper } = setup();
      const { result } = await renderHook(
        () => useCreateMockInterviewQuestion('app-1', 'round-1'),
        {
          wrapper,
        },
      );

      await act(async () => {
        await result.current.mutateAsync({ question: 'Why us?', answer: '   ' });
      });

      expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), {
        input: { interviewRoundId: 'round-1', question: 'Why us?' },
      });
    });

    it('refreshes the questions and the round list, whose count has moved', async () => {
      mockedGqlRequest.mockResolvedValueOnce({ createMockInterviewQuestion: question('q1') });
      const { wrapper, invalidate } = setup();
      const { result } = await renderHook(
        () => useCreateMockInterviewQuestion('app-1', 'round-1'),
        {
          wrapper,
        },
      );

      await act(async () => {
        await result.current.mutateAsync({ question: 'Why us?', answer: '' });
      });

      expect(invalidatedKeys(invalidate)).toEqual(
        expect.arrayContaining([
          mockInterviewQuestionsQueryKey('round-1'),
          interviewRoundsQueryKey('app-1'),
        ]),
      );
    });
  });

  describe('useUpdateMockInterviewQuestion', () => {
    it('sends no answer source when editing, so an AI answer keeps its label', async () => {
      mockedGqlRequest.mockResolvedValueOnce({ updateMockInterviewQuestion: question('q1') });
      const { wrapper } = setup();
      const { result } = await renderHook(
        () => useUpdateMockInterviewQuestion('app-1', 'round-1'),
        {
          wrapper,
        },
      );

      await act(async () => {
        await result.current.mutateAsync({ id: 'q1', data: { question: 'Q', answer: 'Reworded' } });
      });

      expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), {
        id: 'q1',
        input: { question: 'Q', answer: 'Reworded' },
      });
    });

    it('marks the answer `ai` when saving an AI draft', async () => {
      mockedGqlRequest.mockResolvedValueOnce({ updateMockInterviewQuestion: question('q1') });
      const { wrapper } = setup();
      const { result } = await renderHook(
        () => useUpdateMockInterviewQuestion('app-1', 'round-1'),
        {
          wrapper,
        },
      );

      await act(async () => {
        await result.current.mutateAsync({
          id: 'q1',
          data: { question: 'Q', answer: 'Drafted' },
          answerSource: 'ai',
        });
      });

      expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), {
        id: 'q1',
        input: { question: 'Q', answer: 'Drafted', answerSource: 'ai' },
      });
    });

    it('clears the answer with null when it is blank, and refreshes only the questions', async () => {
      mockedGqlRequest.mockResolvedValueOnce({ updateMockInterviewQuestion: question('q1') });
      const { wrapper, invalidate } = setup();
      const { result } = await renderHook(
        () => useUpdateMockInterviewQuestion('app-1', 'round-1'),
        {
          wrapper,
        },
      );

      await act(async () => {
        await result.current.mutateAsync({ id: 'q1', data: { question: 'Q', answer: '  ' } });
      });

      expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), {
        id: 'q1',
        input: { question: 'Q', answer: null },
      });
      expect(invalidatedKeys(invalidate)).toEqual([mockInterviewQuestionsQueryKey('round-1')]);
    });
  });

  describe('useAddMockInterviewQuestions', () => {
    it('saves the kept suggestions one at a time, in order', async () => {
      const order: string[] = [];
      mockedGqlRequest.mockImplementation(async (_doc, variables) => {
        const input = (variables as { input: { question: string } }).input;
        order.push(`start:${input.question}`);
        await Promise.resolve();
        order.push(`end:${input.question}`);
        return { createMockInterviewQuestion: question('x') };
      });
      const { wrapper } = setup();
      const { result } = await renderHook(() => useAddMockInterviewQuestions('app-1', 'round-1'), {
        wrapper,
      });

      await act(async () => {
        await result.current.mutateAsync(['One?', 'Two?']);
      });

      expect(order).toEqual(['start:One?', 'end:One?', 'start:Two?', 'end:Two?']);
      expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), {
        input: { interviewRoundId: 'round-1', question: 'One?' },
      });
    });

    it('stops at the first failure but still refreshes, since earlier ones were saved', async () => {
      mockedGqlRequest
        .mockResolvedValueOnce({ createMockInterviewQuestion: question('q1') })
        .mockRejectedValueOnce(new Error('quota'));
      const { wrapper, invalidate } = setup();
      const { result } = await renderHook(() => useAddMockInterviewQuestions('app-1', 'round-1'), {
        wrapper,
      });

      await act(async () => {
        await result.current.mutateAsync(['One?', 'Two?', 'Three?']).catch(() => undefined);
      });

      expect(mockedGqlRequest).toHaveBeenCalledTimes(2);
      expect(invalidatedKeys(invalidate)).toEqual(
        expect.arrayContaining([
          mockInterviewQuestionsQueryKey('round-1'),
          interviewRoundsQueryKey('app-1'),
        ]),
      );
    });
  });

  describe('useDeleteMockInterviewQuestion', () => {
    it('deletes by id and refreshes the questions and the round list', async () => {
      mockedGqlRequest.mockResolvedValueOnce({ deleteMockInterviewQuestion: true });
      const { wrapper, invalidate } = setup();
      const { result } = await renderHook(
        () => useDeleteMockInterviewQuestion('app-1', 'round-1'),
        {
          wrapper,
        },
      );

      await act(async () => {
        await result.current.mutateAsync('q1');
      });

      expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), { id: 'q1' });
      expect(invalidatedKeys(invalidate)).toEqual(
        expect.arrayContaining([
          mockInterviewQuestionsQueryKey('round-1'),
          interviewRoundsQueryKey('app-1'),
        ]),
      );
    });
  });

  describe('useReorderMockInterviewQuestions', () => {
    it('shows the new order straight away and restores the old one on failure', async () => {
      mockedGqlRequest.mockRejectedValueOnce(new Error('nope'));
      const { wrapper, queryClient } = setup();
      const key = mockInterviewQuestionsQueryKey('round-1');
      queryClient.setQueryData(key, [question('a'), question('b')]);
      const { result } = await renderHook(
        () => useReorderMockInterviewQuestions('app-1', 'round-1'),
        {
          wrapper,
        },
      );

      await act(async () => {
        await result.current.mutateAsync(['b', 'a']).catch(() => undefined);
      });

      expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), {
        interviewRoundId: 'round-1',
        orderedIds: ['b', 'a'],
      });
      expect((queryClient.getQueryData(key) as MockInterviewQuestion[]).map((q) => q.id)).toEqual([
        'a',
        'b',
      ]);
    });
  });

  describe('useGenerateMockInterviewQuestions', () => {
    it('sends the prompt and a count, and returns suggestions without touching the cache', async () => {
      const generated = { suggestions: ['One?'], usedJobDescription: true, usedBriefing: false };
      mockedGqlRequest.mockResolvedValueOnce({ generateMockInterviewQuestions: generated });
      const { wrapper, invalidate } = setup();
      const { result } = await renderHook(() => useGenerateMockInterviewQuestions('round-1'), {
        wrapper,
      });

      let value: unknown;
      await act(async () => {
        value = await result.current.mutateAsync(' system design ');
      });

      expect(value).toEqual(generated);
      expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), {
        interviewRoundId: 'round-1',
        prompt: 'system design',
        count: 5,
      });
      expect(invalidate).not.toHaveBeenCalled();
    });

    it('sends no prompt when it is blank', async () => {
      mockedGqlRequest.mockResolvedValueOnce({
        generateMockInterviewQuestions: {
          suggestions: [],
          usedJobDescription: false,
          usedBriefing: false,
        },
      });
      const { wrapper } = setup();
      const { result } = await renderHook(() => useGenerateMockInterviewQuestions('round-1'), {
        wrapper,
      });

      await act(async () => {
        await result.current.mutateAsync('   ');
      });

      expect(mockedGqlRequest).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ prompt: null }),
      );
    });
  });

  describe('useGenerateMockInterviewAnswer', () => {
    it('returns a draft for the question and saves nothing', async () => {
      const generated = { answer: 'A draft.', usedJobDescription: true, usedBriefing: true };
      mockedGqlRequest.mockResolvedValueOnce({ generateMockInterviewAnswer: generated });
      const { wrapper, invalidate } = setup();
      const { result } = await renderHook(() => useGenerateMockInterviewAnswer(), { wrapper });

      let value: unknown;
      await act(async () => {
        value = await result.current.mutateAsync('q1');
      });

      expect(value).toEqual(generated);
      expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), {
        mockInterviewQuestionId: 'q1',
      });
      expect(invalidate).not.toHaveBeenCalled();
    });
  });
});
