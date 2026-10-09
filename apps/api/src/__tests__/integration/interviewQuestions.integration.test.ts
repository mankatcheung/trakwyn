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
    createInterviewRound(input: $input) { id questionCount }
  }
`;

const ROUNDS_QUERY = `
  query InterviewRounds($applicationId: ID!) {
    interviewRounds(applicationId: $applicationId) { id questionCount outcome }
  }
`;

const UPDATE_ROUND_MUTATION = `
  mutation UpdateInterviewRound($id: ID!, $input: UpdateInterviewRoundInput!) {
    updateInterviewRound(id: $id, input: $input) { id outcome }
  }
`;

const CREATE_QUESTION_MUTATION = `
  mutation CreateInterviewQuestion($input: CreateInterviewQuestionInput!) {
    createInterviewQuestion(input: $input) { id interviewRoundId question answer position }
  }
`;

const UPDATE_QUESTION_MUTATION = `
  mutation UpdateInterviewQuestion($id: ID!, $input: UpdateInterviewQuestionInput!) {
    updateInterviewQuestion(id: $id, input: $input) { id question answer }
  }
`;

const DELETE_QUESTION_MUTATION = `
  mutation DeleteInterviewQuestion($id: ID!) { deleteInterviewQuestion(id: $id) }
`;

const REORDER_MUTATION = `
  mutation ReorderInterviewQuestions($interviewRoundId: ID!, $orderedIds: [ID!]!) {
    reorderInterviewQuestions(interviewRoundId: $interviewRoundId, orderedIds: $orderedIds) {
      id
      position
    }
  }
`;

const QUESTIONS_QUERY = `
  query InterviewQuestions($interviewRoundId: ID!) {
    interviewQuestions(interviewRoundId: $interviewRoundId) { id question answer position }
  }
`;

interface GraphQLResponse<T> {
  data: T | null;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

describe('interview questions integration', () => {
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
    gql<{ createInterviewQuestion: { id: string; position: number; answer: string | null } }>(
      token,
      CREATE_QUESTION_MUTATION,
      { input: { interviewRoundId: roundId, question, answer } },
    );

  it('records a question and fills in the answer after the round is finished', async () => {
    const token = await register();
    const { applicationId, roundId } = await createRound(token);

    const created = await addQuestion(token, roundId, 'Describe a hard bug.');
    expect(created.errors).toBeUndefined();
    expect(created.data!.createInterviewQuestion.answer).toBeNull();

    await gql(token, UPDATE_ROUND_MUTATION, { id: roundId, input: { outcome: 'passed' } });

    const updated = await gql<{ updateInterviewQuestion: { answer: string } }>(
      token,
      UPDATE_QUESTION_MUTATION,
      {
        id: created.data!.createInterviewQuestion.id,
        input: { answer: 'A race in the cache layer.' },
      },
    );
    expect(updated.errors).toBeUndefined();
    expect(updated.data!.updateInterviewQuestion.answer).toBe('A race in the cache layer.');

    const rounds = await gql<{
      interviewRounds: Array<{ questionCount: number; outcome: string }>;
    }>(token, ROUNDS_QUERY, { applicationId });
    expect(rounds.data!.interviewRounds[0]).toMatchObject({ questionCount: 1, outcome: 'passed' });
  });

  it('keeps the count on the round in step with adds and deletes', async () => {
    const token = await register();
    const { applicationId, roundId } = await createRound(token);

    const first = await addQuestion(token, roundId, 'One');
    await addQuestion(token, roundId, 'Two');
    const countAfterAdds = await gql<{ interviewRounds: Array<{ questionCount: number }> }>(
      token,
      ROUNDS_QUERY,
      { applicationId },
    );
    await gql(token, DELETE_QUESTION_MUTATION, { id: first.data!.createInterviewQuestion.id });
    const countAfterDelete = await gql<{ interviewRounds: Array<{ questionCount: number }> }>(
      token,
      ROUNDS_QUERY,
      { applicationId },
    );

    expect(countAfterAdds.data!.interviewRounds[0].questionCount).toBe(2);
    expect(countAfterDelete.data!.interviewRounds[0].questionCount).toBe(1);
  });

  it('reorders the questions', async () => {
    const token = await register();
    const { roundId } = await createRound(token);
    const a = (await addQuestion(token, roundId, 'A')).data!.createInterviewQuestion.id;
    const b = (await addQuestion(token, roundId, 'B')).data!.createInterviewQuestion.id;

    const reordered = await gql<{ reorderInterviewQuestions: Array<{ id: string }> }>(
      token,
      REORDER_MUTATION,
      { interviewRoundId: roundId, orderedIds: [b, a] },
    );
    const listed = await gql<{ interviewQuestions: Array<{ id: string }> }>(
      token,
      QUESTIONS_QUERY,
      {
        interviewRoundId: roundId,
      },
    );

    expect(reordered.data!.reorderInterviewQuestions.map((q) => q.id)).toEqual([b, a]);
    expect(listed.data!.interviewQuestions.map((q) => q.id)).toEqual([b, a]);
  });

  it("does not let another user read or change a round's questions", async () => {
    const owner = await register();
    const intruder = await register();
    const { roundId } = await createRound(owner);
    const created = await addQuestion(owner, roundId, 'Private');
    const questionId = created.data!.createInterviewQuestion.id;

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
      interviewQuestions: Array<{ question: string; answer: string | null }>;
    }>(owner, QUESTIONS_QUERY, { interviewRoundId: roundId });
    expect(still.data!.interviewQuestions).toEqual([
      expect.objectContaining({ question: 'Private', answer: null }),
    ]);
  });

  it('refuses the question past the per-round limit with a quota error', async () => {
    const token = await register();
    const { roundId } = await createRound(token);

    for (let i = 0; i < CONTENT_LIMITS.QUESTIONS_PER_ROUND; i += 1) {
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
});
