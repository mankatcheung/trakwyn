import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../i18n';
import { AuthProvider, useAuth } from '../auth/AuthContext';
import { gqlRequest } from '../graphql/client';
import { CREATE_APPLICATION_MUTATION } from '../features/applications/graphql/operations';
import { CREATE_INTERVIEW_ROUND_MUTATION } from '../features/interviews/graphql/operations';
import { useInterviewRounds } from '../features/interviews/hooks/useInterviewQueries';
import { useInterviewQuestions } from '../features/interviews/hooks/useInterviewQuestionQueries';
import { useMockInterviewQuestions } from '../features/interviews/hooks/useMockInterviewQuestionQueries';
import {
  useCreateMockInterviewQuestion,
  useDeleteMockInterviewQuestion,
  useGenerateMockInterviewAnswer,
  useGenerateMockInterviewQuestions,
  useUpdateMockInterviewQuestion,
} from '../features/interviews/hooks/useMockInterviewQuestionMutations';

/**
 * The practice question hooks against a real API. Every other suite replaces
 * the transport, so none can say whether the practice list really stays apart
 * from the questions asked, or that the "AI generated" label survives a round
 * trip through the server.
 */

const PASSWORD = 'CorrectHorseBatteryStaple1!';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

describe('practice interview questions against a real API', () => {
  const email = `mq-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  let applicationId: string;
  let roundId: string;

  beforeAll(async () => {
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.register(email, PASSWORD);
    });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    const app = await gqlRequest<{ createApplication: { id: string } }>(
      CREATE_APPLICATION_MUTATION,
      { input: { company: 'Acme', role: 'Engineer', status: 'interviewing' } },
    );
    applicationId = app.createApplication.id;
    const round = await gqlRequest<{ createInterviewRound: { id: string } }>(
      CREATE_INTERVIEW_ROUND_MUTATION,
      { input: { applicationId, type: 'technical' } },
    );
    roundId = round.createInterviewRound.id;
  });

  it('keeps practice questions and the AI label apart from the questions asked', async () => {
    const { result } = await renderHook(
      () => ({
        practice: useMockInterviewQuestions(roundId),
        asked: useInterviewQuestions(roundId),
        rounds: useInterviewRounds(applicationId),
        create: useCreateMockInterviewQuestion(applicationId, roundId),
        update: useUpdateMockInterviewQuestion(applicationId, roundId),
        remove: useDeleteMockInterviewQuestion(applicationId, roundId),
      }),
      { wrapper },
    );

    await act(async () => {
      await result.current.create.mutateAsync({ question: 'Why us?', answer: '' });
      await result.current.create.mutateAsync({ question: 'Why now?', answer: '' });
    });
    await waitFor(() => expect(result.current.practice.data).toHaveLength(2));
    await waitFor(() => expect(result.current.rounds.data?.[0].mockQuestionCount).toBe(2));
    // The questions asked in the interview are untouched.
    expect(result.current.asked.data ?? []).toHaveLength(0);
    expect(result.current.rounds.data?.[0].questionCount).toBe(0);

    const first = result.current.practice.data![0];
    expect(first.answerSource).toBe('user');

    // Saving an AI draft labels it; editing the text afterwards keeps the label.
    await act(async () => {
      await result.current.update.mutateAsync({
        id: first.id,
        data: { question: first.question, answer: 'A drafted answer.' },
        answerSource: 'ai',
      });
    });
    await waitFor(() =>
      expect(result.current.practice.data?.find((q) => q.id === first.id)?.answerSource).toBe('ai'),
    );

    await act(async () => {
      await result.current.update.mutateAsync({
        id: first.id,
        data: { question: first.question, answer: 'Reworded by me.' },
      });
    });
    await waitFor(() =>
      expect(result.current.practice.data?.find((q) => q.id === first.id)).toMatchObject({
        answer: 'Reworded by me.',
        answerSource: 'ai',
      }),
    );

    // Clearing the answer drops the label.
    await act(async () => {
      await result.current.update.mutateAsync({
        id: first.id,
        data: { question: first.question, answer: '' },
      });
    });
    await waitFor(() =>
      expect(result.current.practice.data?.find((q) => q.id === first.id)).toMatchObject({
        answer: null,
        answerSource: 'user',
      }),
    );

    await act(async () => {
      await result.current.remove.mutateAsync(first.id);
    });
    await waitFor(() => expect(result.current.practice.data).toHaveLength(1));
    await waitFor(() => expect(result.current.rounds.data?.[0].mockQuestionCount).toBe(1));
  });

  it('asks for an AI key before generating, with the API’s coded error', async () => {
    const { result } = await renderHook(
      () => ({
        questions: useGenerateMockInterviewQuestions(roundId),
        answer: useGenerateMockInterviewAnswer(),
        practice: useMockInterviewQuestions(roundId),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.practice.data).toBeDefined());

    const questionsError = await act(async () =>
      result.current.questions.mutateAsync('system design').catch((error: unknown) => error),
    );
    const answerError = await act(async () =>
      result.current.answer
        .mutateAsync(result.current.practice.data![0].id)
        .catch((error: unknown) => error),
    );

    const code = (error: unknown) =>
      (error as { response?: { errors?: { extensions?: { code?: string } }[] } }).response
        ?.errors?.[0]?.extensions?.code;
    expect(code(questionsError)).toBe('AI_NOT_CONFIGURED');
    expect(code(answerError)).toBe('AI_NOT_CONFIGURED');
  });
});
