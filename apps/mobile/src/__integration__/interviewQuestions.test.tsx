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
import {
  useCreateInterviewQuestion,
  useDeleteInterviewQuestion,
  useReorderInterviewQuestions,
} from '../features/interviews/hooks/useInterviewQuestionMutations';

/**
 * The question hooks against a real API. Every other suite replaces the
 * transport, so none of them can say whether a delete or a reorder actually
 * reaches the server and comes back with the list and the round's count right.
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

describe('interview questions against a real API', () => {
  const email = `iq-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

  it('creates, reorders and deletes questions, keeping the list and the count right', async () => {
    const { result } = await renderHook(
      () => ({
        questions: useInterviewQuestions(roundId),
        rounds: useInterviewRounds(applicationId),
        create: useCreateInterviewQuestion(applicationId, roundId),
        remove: useDeleteInterviewQuestion(applicationId, roundId),
        reorder: useReorderInterviewQuestions(applicationId, roundId),
      }),
      { wrapper },
    );

    for (const question of ['One', 'Two', 'Three']) {
      await act(async () => {
        await result.current.create.mutateAsync({ question, answer: '' });
      });
    }
    await waitFor(() => expect(result.current.questions.data).toHaveLength(3));
    await waitFor(() => expect(result.current.rounds.data?.[0].questionCount).toBe(3));

    const ids = result.current.questions.data!.map((q) => q.id);
    await act(async () => {
      await result.current.reorder.mutateAsync([ids[2], ids[0], ids[1]]);
    });
    await waitFor(() =>
      expect(result.current.questions.data?.map((q) => q.question)).toEqual([
        'Three',
        'One',
        'Two',
      ]),
    );

    await act(async () => {
      await result.current.remove.mutateAsync(ids[0]);
    });

    await waitFor(() =>
      expect(result.current.questions.data?.map((q) => q.question)).toEqual(['Three', 'Two']),
    );
    await waitFor(() => expect(result.current.rounds.data?.[0].questionCount).toBe(2));
  });
});
