import type { QueryClient } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import {
  CREATE_QUESTION,
  DELETE_QUESTION,
  REORDER_QUESTIONS,
  UPDATE_QUESTION,
  interviewQuestionsQueryOptions,
  type InterviewQuestionsData,
} from '#/features/interviews/graphql/interviewQuestionQueries';
import {
  CREATE_ROUND,
  DELETE_ROUND,
  interviewRoundsQueryOptions,
} from '#/features/interviews/graphql/interviewRoundQueries';
import { buildOptimisticRound } from '#/features/interviews/lib/optimisticRound';
import { emptyForm } from '#/features/interviews/lib/roundForm';
import {
  createApplication,
  field,
  without,
  createRound,
  newTestQueryClient,
  registerFreshUser,
} from './support/fixtures';

/**
 * The interview question and round documents against a real API. The component
 * suites answer `gqlClient` with a response they invented; none can say whether
 * a create, delete or reorder reaches the server and comes back with the list
 * and the round's `questionCount` right. Every assertion below follows a fresh
 * `fetchQuery`, so it is on what the server holds, not on what the cache says.
 */

describe('interview questions and rounds against a real API', () => {
  let applicationId: string;
  let roundId: string;
  let client: QueryClient;

  const questions = async () =>
    (await client.query(interviewQuestionsQueryOptions(roundId))).interviewQuestions;
  const rounds = async () =>
    (await client.query(interviewRoundsQueryOptions(applicationId))).interviewRounds;
  const addQuestion = async (question: string) =>
    field(
      await gqlClient.request(CREATE_QUESTION, { input: { interviewRoundId: roundId, question } }),
      'createInterviewQuestion',
    );

  beforeAll(async () => {
    await registerFreshUser('iq');
  });

  beforeEach(async () => {
    client = newTestQueryClient();
    applicationId = await createApplication();
    roundId = await createRound(applicationId);
  });

  it('creates questions in order and counts them on the round', async () => {
    await addQuestion('One');
    await addQuestion('Two');
    await addQuestion('Three');

    expect((await questions()).map((q) => q.question)).toEqual(['One', 'Two', 'Three']);
    expect((await rounds())[0].questionCount).toBe(3);
  });

  it('updates a question and clears its answer', async () => {
    const created = await addQuestion('Original');

    await gqlClient.request(UPDATE_QUESTION, {
      id: created.id,
      input: { question: 'Reworded', answer: 'An answer' },
    });
    expect((await questions())[0]).toMatchObject({ question: 'Reworded', answer: 'An answer' });

    await gqlClient.request(UPDATE_QUESTION, {
      id: created.id,
      input: { question: 'Reworded', answer: null },
    });
    expect((await questions())[0].answer).toBeNull();
  });

  it('reorders, and the optimistic order InterviewQuestionsPanel writes is what the server returns', async () => {
    for (const question of ['One', 'Two', 'Three']) await addQuestion(question);
    const before = await questions();
    const ids = before.map((q) => q.id);
    const reordered = [ids[2], ids[0], ids[1]];

    // The panel's `onMutate`: the cache lists the questions in the requested order.
    const optimistic: InterviewQuestionsData = {
      interviewQuestions: reordered.map((id) => before.find((q) => q.id === id)!),
    };

    await gqlClient.request(REORDER_QUESTIONS, {
      interviewRoundId: roundId,
      orderedIds: reordered,
    });
    const fresh = await questions();

    expect(fresh.map((q) => q.question)).toEqual(['Three', 'One', 'Two']);
    // Same ids in the same order. `position` is the one field the optimistic
    // copy cannot know, so it is the server's to renumber.
    expect(optimistic.interviewQuestions.map((q) => q.id)).toEqual(fresh.map((q) => q.id));
    expect(fresh.map((q) => q.position)).toEqual(
      [...fresh.map((q) => q.position)].sort((a, b) => a - b),
    );
    const volatile = ['position', 'updatedAt'] as const;
    expect(optimistic.interviewQuestions.map((q) => without(q, volatile))).toEqual(
      fresh.map((q) => without(q, volatile)),
    );
  });

  it('deletes a question and lowers the round count', async () => {
    const one = await addQuestion('One');
    await addQuestion('Two');
    expect((await rounds())[0].questionCount).toBe(2);

    await gqlClient.request(DELETE_QUESTION, { id: one.id });

    expect((await questions()).map((q) => q.question)).toEqual(['Two']);
    expect((await rounds())[0].questionCount).toBe(1);
  });

  it('creates a round whose shape matches the optimistic round the tab shows meanwhile', async () => {
    const form = {
      ...emptyForm(),
      type: 'onsite' as const,
      interviewerName: 'Sam',
      notes: 'Bring ID',
    };
    const optimistic = buildOptimisticRound(applicationId, form);

    const created = field(
      await gqlClient.request(CREATE_ROUND, {
        input: {
          applicationId,
          type: form.type,
          interviewerName: form.interviewerName,
          notes: form.notes,
          outcome: form.outcome,
        },
      }),
      'createInterviewRound',
    );
    const fresh = (await rounds()).find((r) => r.id === created.id)!;

    // A stand-in that drifts from the server's round, by a renamed or dropped
    // field, would flicker when the real one replaces it.
    expect(Object.keys(optimistic).sort()).toEqual(Object.keys(fresh).sort());
    expect(without(optimistic, ['id', 'createdAt', 'updatedAt'])).toEqual(
      without(fresh, ['id', 'createdAt', 'updatedAt']),
    );
    expect(created.questionCount).toBe(0);
  });

  it('removes a round with its questions from the list', async () => {
    await addQuestion('One');
    expect(await rounds()).toHaveLength(1);

    await gqlClient.request(DELETE_ROUND, { id: roundId });

    expect(await rounds()).toEqual([]);
  });
});
