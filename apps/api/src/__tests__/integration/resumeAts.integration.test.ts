import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';

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

const CREATE_DRAFT_MUTATION = `
  mutation CreateDocumentDraft($input: CreateDocumentDraftInput!) {
    createDocumentDraft(input: $input) { id }
  }
`;

const ATS_MUTATION = `
  mutation ComputeResumeAtsScore($documentDraftId: ID, $documentId: ID) {
    computeResumeAtsScore(documentDraftId: $documentDraftId, documentId: $documentId) {
      score
      label
      readable
      checks { id label passed points maxPoints hint }
    }
  }
`;

interface AtsScore {
  score: number;
  label: string;
  readable: boolean;
  checks: Array<{
    id: string;
    passed: boolean;
    points: number;
    maxPoints: number;
    hint: string;
  }>;
}

interface GraphQLResponse<T> {
  data: T | null;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

const RESUME_TEXT = [
  'Jane Doe',
  'jane.doe@example.com',
  '+1 415 555 0134',
  'Work Experience',
  'Engineer, Acme — Jan 2021 – Present',
  '- Cut page load time by 40%',
  '- Led a team of 6 engineers',
  '- Shipped 12 releases',
  'Education',
  'BSc, State University — 2013 – 2017',
].join('\n');

describe('resume ATS score integration', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  async function gql<T>(
    token: string | null,
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<GraphQLResponse<T>> {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      payload: { query, variables },
    });
    return res.json() as GraphQLResponse<T>;
  }

  async function register(): Promise<string> {
    const res = await gql<{ registerMobile: { accessToken: string } }>(
      null,
      REGISTER_MOBILE_MUTATION,
      { email: `${randomUUID()}@example.com`, password: 'correct-horse-1' },
    );
    return res.data!.registerMobile.accessToken;
  }

  async function createResumeDraft(token: string, plainText: string): Promise<string> {
    const app = await gql<{ createApplication: { id: string } }>(
      token,
      CREATE_APPLICATION_MUTATION,
      { input: { company: 'Acme', role: 'Engineer', status: 'applied' } },
    );
    const draft = await gql<{ createDocumentDraft: { id: string } }>(token, CREATE_DRAFT_MUTATION, {
      input: {
        applicationId: app.data!.createApplication.id,
        type: 'resume',
        title: 'My resume',
        plainText,
        contentJson: '{}',
      },
    });
    return draft.data!.createDocumentDraft.id;
  }

  it('scores a resume draft without any AI key and lists every check', async () => {
    const token = await register();
    const draftId = await createResumeDraft(token, RESUME_TEXT);

    const res = await gql<{ computeResumeAtsScore: AtsScore }>(token, ATS_MUTATION, {
      documentDraftId: draftId,
    });

    expect(res.errors).toBeUndefined();
    const result = res.data!.computeResumeAtsScore;
    expect(result.readable).toBe(true);
    expect(result.checks.map((c) => c.id)).toContain('skills_heading');
    expect(result.score).toBe(result.checks.reduce((sum, c) => sum + c.points, 0));
    expect(result.checks.find((c) => c.id === 'skills_heading')).toMatchObject({
      passed: false,
      points: 0,
      maxPoints: 9,
    });
  });

  it('returns the same score for the same draft every time', async () => {
    const token = await register();
    const draftId = await createResumeDraft(token, RESUME_TEXT);

    const first = await gql(token, ATS_MUTATION, { documentDraftId: draftId });
    const second = await gql(token, ATS_MUTATION, { documentDraftId: draftId });

    expect(second).toEqual(first);
  });

  it('reports an empty draft as not readable', async () => {
    const token = await register();
    const draftId = await createResumeDraft(token, '');

    const res = await gql<{ computeResumeAtsScore: AtsScore }>(token, ATS_MUTATION, {
      documentDraftId: draftId,
    });

    expect(res.data!.computeResumeAtsScore).toMatchObject({ score: 0, readable: false });
  });

  it("refuses another user's draft", async () => {
    const owner = await register();
    const intruder = await register();
    const draftId = await createResumeDraft(owner, RESUME_TEXT);

    const res = await gql<{ computeResumeAtsScore: AtsScore | null }>(intruder, ATS_MUTATION, {
      documentDraftId: draftId,
    });

    expect(res.data?.computeResumeAtsScore ?? null).toBeNull();
    expect(res.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
  });

  it('returns NOT_FOUND for a draft that does not exist', async () => {
    const token = await register();
    const res = await gql(token, ATS_MUTATION, { documentDraftId: 'missing-draft' });
    expect(res.errors?.[0]?.extensions?.code).toBe('NOT_FOUND');
  });

  it('rejects a request naming neither or both resumes', async () => {
    const token = await register();
    const neither = await gql(token, ATS_MUTATION, {});
    const both = await gql(token, ATS_MUTATION, { documentDraftId: 'a', documentId: 'b' });

    expect(neither.errors?.[0]?.extensions?.code).toBe('VALIDATION');
    expect(both.errors?.[0]?.extensions?.code).toBe('VALIDATION');
  });

  it('requires a signed-in user', async () => {
    const res = await gql(null, ATS_MUTATION, { documentDraftId: 'x' });
    expect(res.errors?.[0]?.extensions?.code).toBe('UNAUTHORIZED');
  });
});
