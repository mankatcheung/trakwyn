import type { QueryClient } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { apiOrigin } from '../../devPorts';
import {
  CREATE_MOCK_QUESTION,
  DELETE_MOCK_QUESTION,
  GENERATE_MOCK_ANSWER,
  GENERATE_MOCK_QUESTIONS,
  GENERATE_MOCK_TALKING_POINTS,
  UPDATE_MOCK_QUESTION,
  mockQuestionsQueryOptions,
} from '#/features/interviews/graphql/mockQuestionApi';
import { interviewQuestionsQueryOptions } from '#/features/interviews/graphql/interviewQuestionQueries';
import { interviewRoundsQueryOptions } from '#/features/interviews/graphql/interviewRoundQueries';
import { SAVE_LLM_API_KEY } from '#/features/settings/graphql/aiQueries';
import { CREATE_WORK_EXPERIENCE } from '#/features/profile/graphql/workExperienceQueries';
import {
  createApplication,
  createRound,
  newTestQueryClient,
  registerFreshUser,
  field,
} from './support/fixtures';

/**
 * The practice (mock) question documents against a real API, with generation
 * answered by the API's own fake provider (`LLM_PROVIDER_MODE=fake`), which the
 * "Custom (OpenAI-compatible)" provider reaches by base URL as in the e2e specs.
 * Each write is followed by a fresh read of the practice list, the questions
 * asked and the round, so the assertions are on server state.
 */

const FAKE_LLM_URL = `${apiOrigin}/llm-test/fake/chat/completions`;

describe('practice interview questions against a real API', () => {
  let applicationId: string;
  let roundId: string;
  let client: QueryClient;

  const practice = async () =>
    (await client.query(mockQuestionsQueryOptions(roundId))).mockInterviewQuestions;
  const asked = async () =>
    (await client.query(interviewQuestionsQueryOptions(roundId))).interviewQuestions;
  const round = async () =>
    (await client.query(interviewRoundsQueryOptions(applicationId))).interviewRounds[0];
  const addPractice = async (question: string, answer?: string) =>
    field(
      await gqlClient.request(CREATE_MOCK_QUESTION, {
        input: { interviewRoundId: roundId, question, ...(answer ? { answer } : {}) },
      }),
      'createMockInterviewQuestion',
    );

  beforeAll(async () => {
    await registerFreshUser('mq');
    await gqlClient.request(SAVE_LLM_API_KEY, {
      provider: 'custom',
      apiKey: 'fake-api-key',
      model: 'fake-model',
      baseUrl: FAKE_LLM_URL,
    });
    // The fake provider cites these two roles, and talking points keep only a
    // point whose source is in the user's own profile.
    for (const [company, title] of [
      ['Acme Corp', 'Senior Engineer'],
      ['Globex', 'Software Engineer'],
    ]) {
      await gqlClient.request(CREATE_WORK_EXPERIENCE, {
        input: { company, title, startDate: '2020-01' },
      });
    }
  });

  beforeEach(async () => {
    client = newTestQueryClient();
    applicationId = await createApplication();
    roundId = await createRound(applicationId);
  });

  it('creates, updates and deletes practice questions, apart from the questions asked', async () => {
    const first = await addPractice('Why us?');
    await addPractice('Why now?');

    expect((await practice()).map((q) => q.question)).toEqual(['Why us?', 'Why now?']);
    expect(await round()).toMatchObject({ mockQuestionCount: 2, questionCount: 0 });
    expect(await asked()).toEqual([]);
    expect((await practice())[0].answerSource).toBe('user');

    await gqlClient.request(UPDATE_MOCK_QUESTION, {
      id: first.id,
      input: { question: 'Why us?', answer: 'The scope.', answerSource: 'ai' },
    });
    expect((await practice())[0]).toMatchObject({ answer: 'The scope.', answerSource: 'ai' });

    // Editing the text afterwards keeps the label.
    await gqlClient.request(UPDATE_MOCK_QUESTION, {
      id: first.id,
      input: { question: 'Why us?', answer: 'Reworded.' },
    });
    expect((await practice())[0]).toMatchObject({ answer: 'Reworded.', answerSource: 'ai' });

    // Clearing the answer drops it.
    await gqlClient.request(UPDATE_MOCK_QUESTION, {
      id: first.id,
      input: { question: 'Why us?', answer: '' },
    });
    expect((await practice())[0]).toMatchObject({ answer: null, answerSource: 'user' });

    await gqlClient.request(DELETE_MOCK_QUESTION, { id: first.id });
    expect((await practice()).map((q) => q.question)).toEqual(['Why now?']);
    expect(await round()).toMatchObject({ mockQuestionCount: 1 });
  });

  it('generates suggestions without saving them, then keeps the ones added', async () => {
    const generated = field(
      await gqlClient.request(GENERATE_MOCK_QUESTIONS, {
        interviewRoundId: roundId,
        prompt: 'system design',
        useProfile: false,
      }),
      'generateMockInterviewQuestions',
    );
    expect(generated.suggestions).toHaveLength(3);
    // Suggestions are reviewed first: nothing is saved until the user adds them.
    expect(await practice()).toEqual([]);

    for (const suggestion of generated.suggestions!.slice(0, 2)) await addPractice(suggestion);

    expect((await practice()).map((q) => q.question)).toEqual(generated.suggestions!.slice(0, 2));
    expect((await round()).mockQuestionCount).toBe(2);
  });

  it('drafts an answer and keeps it, labelled, once saved', async () => {
    const question = await addPractice('Tell me about a migration you led');

    const draft = field(
      await gqlClient.request(GENERATE_MOCK_ANSWER, {
        mockInterviewQuestionId: question.id,
        useProfile: false,
      }),
      'generateMockInterviewAnswer',
    );
    expect(draft.answer).toBeTruthy();
    // A draft is shown for review; it is not stored until saved.
    expect((await practice())[0].answer).toBeNull();

    await gqlClient.request(UPDATE_MOCK_QUESTION, {
      id: question.id,
      input: { question: question.question, answer: draft.answer, answerSource: 'ai' },
    });
    expect((await practice())[0]).toMatchObject({ answer: draft.answer, answerSource: 'ai' });
  });

  it('saves talking points on the question, citing the profile', async () => {
    const question = await addPractice('Tell me about a system you scaled');

    const result = field(
      await gqlClient.request(GENERATE_MOCK_TALKING_POINTS, {
        mockInterviewQuestionId: question.id,
        useProfile: true,
      }),
      'generateMockTalkingPoints',
    );
    expect(result.nothingRelevant).toBe(false);
    expect(result.question!.talkingPoints).toContain('distributed systems');

    const stored = (await practice())[0];
    expect(stored.talkingPoints).toBe(result.question!.talkingPoints);
    expect(stored.talkingPointsGeneratedAt).not.toBeNull();
  });
});
