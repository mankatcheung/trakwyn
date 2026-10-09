import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../../graphql/client', () => ({ gqlRequest: jest.fn() }));

import { gqlRequest } from '../../../../graphql/client';
import {
  useCreateInterviewQuestion,
  useDeleteInterviewQuestion,
  useReorderInterviewQuestions,
  useUpdateInterviewQuestion,
} from '../useInterviewQuestionMutations';
import { interviewQuestionsQueryKey } from '../useInterviewQuestionQueries';
import { interviewRoundsQueryKey } from '../useInterviewQueries';
import type { InterviewQuestion } from '../../types';

const mockedGqlRequest = jest.mocked(gqlRequest);

const question = (id: string): InterviewQuestion => ({
  id,
  interviewRoundId: 'round-1',
  question: `Question ${id}`,
  answer: null,
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

describe('useInterviewQuestionMutations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('useCreateInterviewQuestion', () => {
    it('leaves the answer out when it is blank, so the question is not stored as answered', async () => {
      mockedGqlRequest.mockResolvedValueOnce({ createInterviewQuestion: question('q1') });
      const { wrapper } = setup();
      const { result } = await renderHook(() => useCreateInterviewQuestion('app-1', 'round-1'), {
        wrapper,
      });

      await act(async () => {
        await result.current.mutateAsync({ question: 'Why us?', answer: '   ' });
      });

      expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), {
        input: { interviewRoundId: 'round-1', question: 'Why us?' },
      });
    });

    it('sends the answer when there is one', async () => {
      mockedGqlRequest.mockResolvedValueOnce({ createInterviewQuestion: question('q1') });
      const { wrapper } = setup();
      const { result } = await renderHook(() => useCreateInterviewQuestion('app-1', 'round-1'), {
        wrapper,
      });

      await act(async () => {
        await result.current.mutateAsync({ question: 'Why us?', answer: 'The product.' });
      });

      expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), {
        input: { interviewRoundId: 'round-1', question: 'Why us?', answer: 'The product.' },
      });
    });

    it('refreshes the questions and the rounds list, whose cards show the count', async () => {
      mockedGqlRequest.mockResolvedValueOnce({ createInterviewQuestion: question('q1') });
      const { wrapper, invalidate } = setup();
      const { result } = await renderHook(() => useCreateInterviewQuestion('app-1', 'round-1'), {
        wrapper,
      });

      await act(async () => {
        await result.current.mutateAsync({ question: 'Why us?', answer: '' });
      });

      expect(invalidatedKeys(invalidate)).toEqual(
        expect.arrayContaining([
          [...interviewQuestionsQueryKey('round-1')],
          [...interviewRoundsQueryKey('app-1')],
        ]),
      );
    });
  });

  describe('useUpdateInterviewQuestion', () => {
    it('clears the answer when it is emptied', async () => {
      mockedGqlRequest.mockResolvedValueOnce({ updateInterviewQuestion: question('q1') });
      const { wrapper } = setup();
      const { result } = await renderHook(() => useUpdateInterviewQuestion('app-1', 'round-1'), {
        wrapper,
      });

      await act(async () => {
        await result.current.mutateAsync({ id: 'q1', data: { question: 'Q', answer: '  ' } });
      });

      expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), {
        id: 'q1',
        input: { question: 'Q', answer: null },
      });
    });

    it('refreshes only the questions: an edit does not change the count', async () => {
      mockedGqlRequest.mockResolvedValueOnce({ updateInterviewQuestion: question('q1') });
      const { wrapper, invalidate } = setup();
      const { result } = await renderHook(() => useUpdateInterviewQuestion('app-1', 'round-1'), {
        wrapper,
      });

      await act(async () => {
        await result.current.mutateAsync({ id: 'q1', data: { question: 'Q', answer: 'A' } });
      });

      expect(invalidatedKeys(invalidate)).toEqual([[...interviewQuestionsQueryKey('round-1')]]);
    });
  });

  describe('useDeleteInterviewQuestion', () => {
    it('deletes the question and refreshes the questions and the count', async () => {
      mockedGqlRequest.mockResolvedValueOnce({ deleteInterviewQuestion: true });
      const { wrapper, invalidate } = setup();
      const { result } = await renderHook(() => useDeleteInterviewQuestion('app-1', 'round-1'), {
        wrapper,
      });

      await act(async () => {
        await result.current.mutateAsync('q1');
      });

      expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), { id: 'q1' });
      expect(invalidatedKeys(invalidate)).toEqual(
        expect.arrayContaining([
          [...interviewQuestionsQueryKey('round-1')],
          [...interviewRoundsQueryKey('app-1')],
        ]),
      );
    });
  });

  describe('useReorderInterviewQuestions', () => {
    it('shows the new order straight away', async () => {
      mockedGqlRequest.mockReturnValueOnce(new Promise(() => {}));
      const { wrapper, queryClient } = setup();
      queryClient.setQueryData(interviewQuestionsQueryKey('round-1'), [
        question('a'),
        question('b'),
        question('c'),
      ]);
      const { result } = await renderHook(() => useReorderInterviewQuestions('app-1', 'round-1'), {
        wrapper,
      });

      await act(async () => {
        result.current.mutate(['c', 'a', 'b']);
      });

      const shown = queryClient.getQueryData<InterviewQuestion[]>(
        interviewQuestionsQueryKey('round-1'),
      );
      expect(shown?.map((q) => q.id)).toEqual(['c', 'a', 'b']);
      expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), {
        interviewRoundId: 'round-1',
        orderedIds: ['c', 'a', 'b'],
      });
    });

    it('puts the old order back when the server refuses', async () => {
      mockedGqlRequest.mockRejectedValueOnce(new Error('nope'));
      const { wrapper, queryClient } = setup();
      queryClient.setQueryData(interviewQuestionsQueryKey('round-1'), [
        question('a'),
        question('b'),
      ]);
      const { result } = await renderHook(() => useReorderInterviewQuestions('app-1', 'round-1'), {
        wrapper,
      });

      await act(async () => {
        await result.current.mutateAsync(['b', 'a']).catch(() => undefined);
      });

      const shown = queryClient.getQueryData<InterviewQuestion[]>(
        interviewQuestionsQueryKey('round-1'),
      );
      expect(shown?.map((q) => q.id)).toEqual(['a', 'b']);
    });
  });
});
