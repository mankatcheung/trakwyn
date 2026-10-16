import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';
import { CONTENT_LIMITS } from '#src/use-cases/constants.js';

const REGISTER_MOBILE_MUTATION = `
  mutation RegisterMobile($email: String!, $password: String!) {
    registerMobile(email: $email, password: $password) { accessToken }
  }
`;

const CREATE_APPLICATION_MUTATION = `
  mutation CreateApplication($input: CreateApplicationInput!) {
    createApplication(input: $input) { id }
  }
`;

const CREATE_ROUND_MUTATION = `
  mutation CreateInterviewRound($input: CreateInterviewRoundInput!) {
    createInterviewRound(input: $input) { id mockQuestionCount }
  }
`;

const ROUNDS_QUERY = `
  query InterviewRounds($applicationId: ID!) {
    interviewRounds(applicationId: $applicationId) { id mockQuestionCount outcome }
  }
`;

const UPDATE_ROUND_MUTATION = `
  mutation UpdateInterviewRound($id: ID!, $input: UpdateInterviewRoundInput!) {
    updateInterviewRound(id: $id, input: $input) { id outcome }
  }
`;

const CREATE_QUESTION_MUTATION = `
  mutation CreateMockInterviewQuestion($input: CreateMockInterviewQuestionInput!) {
    createMockInterviewQuestion(input: $input) { id interviewRoundId question answer position }
  }
`;

const UPDATE_QUESTION_MUTATION = `
  mutation UpdateMockInterviewQuestion($id: ID!, $input: UpdateMockInterviewQuestionInput!) {
    updateMockInterviewQuestion(id: $id, input: $input) { id question answer }
  }
`;

const DELETE_QUESTION_MUTATION = `
  mutation DeleteMockInterviewQuestion($id: ID!) { deleteMockInterviewQuestion(id: $id) }
`;

const REORDER_MUTATION = `
  mutation ReorderMockInterviewQuestions($interviewRoundId: ID!, $orderedIds: [ID!]!) {
    reorderMockInterviewQuestions(interviewRoundId: $interviewRoundId, orderedIds: $orderedIds) {
      id
      position
    }
  }
`;

const QUESTIONS_QUERY = `
  query MockInterviewQuestions($interviewRoundId: ID!) {
    mockInterviewQuestions(interviewRoundId: $interviewRoundId) { id question answer position }
  }
`;

interface GraphQLResponse<T> {
  data: T | null;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

describe('practice (mock) interview questions integration', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  async function gql<T>(
    token: string,
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<GraphQLResponse<T>> {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      headers: { authorization: `Bearer ${token}` },
      payload: { query, variables },
    });
    return res.json() as GraphQLResponse<T>;
  }

  async function register(): Promise<string> {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: {
        query: REGISTER_MOBILE_MUTATION,
        variables: { email: `${randomUUID()}@example.com`, password: 'correct-horse-1' },
      },
    });
    return (res.json() as GraphQLResponse<{ registerMobile: { accessToken: string } }>).data!
      .registerMobile.accessToken;
  }

  async function createRound(token: string): Promise<{ applicationId: string; roundId: string }> {
    const app = await gql<{ createApplication: { id: string } }>(
      token,
      CREATE_APPLICATION_MUTATION,
      {
        input: { company: 'Acme', role: 'Engineer', status: 'interviewing' },
      },
    );
    const applicationId = app.data!.createApplication.id;
    const round = await gql<{ createInterviewRound: { id: string } }>(
      token,
      CREATE_ROUND_MUTATION,
      {
        input: { applicationId, type: 'technical' },
      },
    );
    return { applicationId, roundId: round.data!.createInterviewRound.id };
  }

  const addQuestion = (token: string, roundId: string, question: string, answer?: string) =>
    gql<{ createMockInterviewQuestion: { id: string; position: number; answer: string | null } }>(
      token,
      CREATE_QUESTION_MUTATION,
      { input: { interviewRoundId: roundId, question, answer } },
    );

  it('records a question and fills in the answer after the round is finished', async () => {
    const token = await register();
    const { applicationId, roundId } = await createRound(token);

    const created = await addQuestion(token, roundId, 'Describe a hard bug.');
    expect(created.errors).toBeUndefined();
    expect(created.data!.createMockInterviewQuestion.answer).toBeNull();

    await gql(token, UPDATE_ROUND_MUTATION, { id: roundId, input: { outcome: 'passed' } });

    const updated = await gql<{ updateMockInterviewQuestion: { answer: string } }>(
      token,
      UPDATE_QUESTION_MUTATION,
      {
        id: created.data!.createMockInterviewQuestion.id,
        input: { answer: 'A race in the cache layer.' },
      },
    );
    expect(updated.errors).toBeUndefined();
    expect(updated.data!.updateMockInterviewQuestion.answer).toBe('A race in the cache layer.');

    const rounds = await gql<{
      interviewRounds: Array<{ mockQuestionCount: number; outcome: string }>;
    }>(token, ROUNDS_QUERY, { applicationId });
    expect(rounds.data!.interviewRounds[0]).toMatchObject({
      mockQuestionCount: 1,
      outcome: 'passed',
    });
  });

  it('keeps the count on the round in step with adds and deletes', async () => {
    const token = await register();
    const { applicationId, roundId } = await createRound(token);

    const first = await addQuestion(token, roundId, 'One');
    await addQuestion(token, roundId, 'Two');
    const countAfterAdds = await gql<{ interviewRounds: Array<{ mockQuestionCount: number }> }>(
      token,
      ROUNDS_QUERY,
      { applicationId },
    );
    await gql(token, DELETE_QUESTION_MUTATION, { id: first.data!.createMockInterviewQuestion.id });
    const countAfterDelete = await gql<{ interviewRounds: Array<{ mockQuestionCount: number }> }>(
      token,
      ROUNDS_QUERY,
      { applicationId },
    );

    expect(countAfterAdds.data!.interviewRounds[0].mockQuestionCount).toBe(2);
    expect(countAfterDelete.data!.interviewRounds[0].mockQuestionCount).toBe(1);
  });

  it('reorders the questions', async () => {
    const token = await register();
    const { roundId } = await createRound(token);
    const a = (await addQuestion(token, roundId, 'A')).data!.createMockInterviewQuestion.id;
    const b = (await addQuestion(token, roundId, 'B')).data!.createMockInterviewQuestion.id;

    const reordered = await gql<{ reorderMockInterviewQuestions: Array<{ id: string }> }>(
      token,
      REORDER_MUTATION,
      { interviewRoundId: roundId, orderedIds: [b, a] },
    );
    const listed = await gql<{ mockInterviewQuestions: Array<{ id: string }> }>(
      token,
      QUESTIONS_QUERY,
      {
        interviewRoundId: roundId,
      },
    );

    expect(reordered.data!.reorderMockInterviewQuestions.map((q) => q.id)).toEqual([b, a]);
    expect(listed.data!.mockInterviewQuestions.map((q) => q.id)).toEqual([b, a]);
  });

  it("does not let another user read or change a round's questions", async () => {
    const owner = await register();
    const intruder = await register();
    const { roundId } = await createRound(owner);
    const created = await addQuestion(owner, roundId, 'Private');
    const questionId = created.data!.createMockInterviewQuestion.id;

    const read = await gql(intruder, QUESTIONS_QUERY, { interviewRoundId: roundId });
    const write = await addQuestion(intruder, roundId, 'Injected');
    const edit = await gql(intruder, UPDATE_QUESTION_MUTATION, {
      id: questionId,
      input: { answer: 'Hijacked' },
    });
    const remove = await gql(intruder, DELETE_QUESTION_MUTATION, { id: questionId });

    for (const res of [read, write, edit, remove]) {
      expect(res.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
    }
    const still = await gql<{
      mockInterviewQuestions: Array<{ question: string; answer: string | null }>;
    }>(owner, QUESTIONS_QUERY, { interviewRoundId: roundId });
    expect(still.data!.mockInterviewQuestions).toEqual([
      expect.objectContaining({ question: 'Private', answer: null }),
    ]);
  });

  it('refuses the question past the per-round limit with a quota error', async () => {
    const token = await register();
    const { roundId } = await createRound(token);

    for (let i = 0; i < CONTENT_LIMITS.MOCK_QUESTIONS_PER_ROUND; i += 1) {
      const res = await addQuestion(token, roundId, `Question ${i}`);
      expect(res.errors).toBeUndefined();
    }
    const overflow = await addQuestion(token, roundId, 'One too many');

    expect(overflow.errors?.[0]?.extensions?.code).toBe('QUOTA_EXCEEDED');
  });

  it('rejects a blank question with a validation error', async () => {
    const token = await register();
    const { roundId } = await createRound(token);

    const res = await addQuestion(token, roundId, '   ');

    expect(res.errors?.[0]?.extensions?.code).toBe('VALIDATION');
  });

  it('keeps practice questions apart from the questions asked in the interview', async () => {
    const token = await register();
    const { applicationId, roundId } = await createRound(token);

    await addQuestion(token, roundId, 'Practice only');
    const asked = await gql<{ createInterviewQuestion: { id: string } }>(
      token,
      `mutation($input: CreateInterviewQuestionInput!) {
        createInterviewQuestion(input: $input) { id }
      }`,
      { input: { interviewRoundId: roundId, question: 'Actually asked' } },
    );
    expect(asked.errors).toBeUndefined();

    const lists = await gql<{
      interviewQuestions: Array<{ question: string }>;
      mockInterviewQuestions: Array<{ question: string }>;
    }>(
      token,
      `query($id: ID!) {
        interviewQuestions(interviewRoundId: $id) { question }
        mockInterviewQuestions(interviewRoundId: $id) { question }
      }`,
      { id: roundId },
    );
    const counts = await gql<{
      interviewRounds: Array<{ questionCount: number; mockQuestionCount: number }>;
    }>(
      token,
      `query($id: ID!) {
        interviewRounds(applicationId: $id) { questionCount mockQuestionCount }
      }`,
      { id: applicationId },
    );

    expect(lists.data!.interviewQuestions).toEqual([{ question: 'Actually asked' }]);
    expect(lists.data!.mockInterviewQuestions).toEqual([{ question: 'Practice only' }]);
    expect(counts.data!.interviewRounds).toContainEqual({ questionCount: 1, mockQuestionCount: 1 });
  });

  it('labels an AI answer, and keeps the label when the text is edited', async () => {
    const token = await register();
    const { roundId } = await createRound(token);
    const created = await gql<{
      createMockInterviewQuestion: { id: string; answerSource: string };
    }>(
      token,
      `mutation($input: CreateMockInterviewQuestionInput!) {
        createMockInterviewQuestion(input: $input) { id answerSource }
      }`,
      {
        input: {
          interviewRoundId: roundId,
          question: 'Why us?',
          answer: 'A draft',
          answerSource: 'ai',
        },
      },
    );
    expect(created.data!.createMockInterviewQuestion.answerSource).toBe('ai');
    const id = created.data!.createMockInterviewQuestion.id;

    const edited = await gql<{
      updateMockInterviewQuestion: { answer: string; answerSource: string };
    }>(
      token,
      `mutation($id: ID!, $input: UpdateMockInterviewQuestionInput!) {
        updateMockInterviewQuestion(id: $id, input: $input) { answer answerSource }
      }`,
      { id, input: { answer: 'My own words now' } },
    );
    const cleared = await gql<{
      updateMockInterviewQuestion: { answer: string | null; answerSource: string };
    }>(
      token,
      `mutation($id: ID!, $input: UpdateMockInterviewQuestionInput!) {
        updateMockInterviewQuestion(id: $id, input: $input) { answer answerSource }
      }`,
      { id, input: { answer: null } },
    );

    expect(edited.data!.updateMockInterviewQuestion).toEqual({
      answer: 'My own words now',
      answerSource: 'ai',
    });
    expect(cleared.data!.updateMockInterviewQuestion).toEqual({
      answer: null,
      answerSource: 'user',
    });
  });

  it('asks for an API key before generating, with a coded error', async () => {
    const token = await register();
    const { roundId } = await createRound(token);
    const questions = await gql(
      token,
      `mutation($id: ID!) {
        generateMockInterviewQuestions(interviewRoundId: $id) { suggestions }
      }`,
      { id: roundId },
    );
    const created = await addQuestion(token, roundId, 'Why us?');
    const answer = await gql(
      token,
      `mutation($id: ID!) {
        generateMockInterviewAnswer(mockInterviewQuestionId: $id) { answer }
      }`,
      { id: created.data!.createMockInterviewQuestion.id },
    );

    expect(questions.errors?.[0]?.extensions?.code).toBe('AI_NOT_CONFIGURED');
    expect(answer.errors?.[0]?.extensions?.code).toBe('AI_NOT_CONFIGURED');
  });

  it("will not generate for another user's round", async () => {
    const owner = await register();
    const intruder = await register();
    const { roundId } = await createRound(owner);

    const res = await gql(
      intruder,
      `mutation($id: ID!) {
        generateMockInterviewQuestions(interviewRoundId: $id) { suggestions }
      }`,
      { id: roundId },
    );

    expect(res.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
  });
});
