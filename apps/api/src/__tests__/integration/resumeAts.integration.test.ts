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

const ATS_SCORES_QUERY = `
  query ResumeAtsScores($applicationId: ID!) {
    resumeAtsScores(applicationId: $applicationId) {
      id
      documentDraftId
      documentId
      score
      readable
      isStale
      generatedAt
      checks { id passed }
    }
  }
`;

const UPDATE_DRAFT_MUTATION = `
  mutation UpdateDocumentDraftContent($input: UpdateDocumentDraftContentInput!) {
    updateDocumentDraftContent(input: $input) { id }
  }
`;

interface SavedScore {
  id: string;
  documentDraftId: string | null;
  documentId: string | null;
  score: number;
  readable: boolean;
  isStale: boolean;
  generatedAt: string;
  checks: Array<{ id: string; passed: boolean }>;
}

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

  async function createResumeDraftIn(
    token: string,
    plainText: string,
  ): Promise<{ applicationId: string; draftId: string }> {
    const app = await gql<{ createApplication: { id: string } }>(
      token,
      CREATE_APPLICATION_MUTATION,
      { input: { company: 'Acme', role: 'Engineer', status: 'applied' } },
    );
    const applicationId = app.data!.createApplication.id;
    const draft = await gql<{ createDocumentDraft: { id: string } }>(token, CREATE_DRAFT_MUTATION, {
      input: {
        applicationId,
        type: 'resume',
        title: 'My resume',
        plainText,
        contentJson: '{}',
      },
    });
    return { applicationId, draftId: draft.data!.createDocumentDraft.id };
  }

  const createResumeDraft = async (token: string, plainText: string): Promise<string> =>
    (await createResumeDraftIn(token, plainText)).draftId;

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

  describe('saving', () => {
    it('is still there on the next read, as after a page reload', async () => {
      const token = await register();
      const { applicationId, draftId } = await createResumeDraftIn(token, RESUME_TEXT);

      const before = await gql<{ resumeAtsScores: SavedScore[] }>(token, ATS_SCORES_QUERY, {
        applicationId,
      });
      expect(before.data!.resumeAtsScores).toEqual([]);

      const computed = await gql<{ computeResumeAtsScore: AtsScore }>(token, ATS_MUTATION, {
        documentDraftId: draftId,
      });
      const after = await gql<{ resumeAtsScores: SavedScore[] }>(token, ATS_SCORES_QUERY, {
        applicationId,
      });

      expect(after.errors).toBeUndefined();
      expect(after.data!.resumeAtsScores).toHaveLength(1);
      expect(after.data!.resumeAtsScores[0]).toMatchObject({
        documentDraftId: draftId,
        documentId: null,
        score: computed.data!.computeResumeAtsScore.score,
        readable: true,
        isStale: false,
      });
      expect(after.data!.resumeAtsScores[0].checks.length).toBeGreaterThan(1);
    });

    it('keeps one result per resume: checking again replaces it', async () => {
      const token = await register();
      const { applicationId, draftId } = await createResumeDraftIn(token, RESUME_TEXT);

      await gql(token, ATS_MUTATION, { documentDraftId: draftId });
      await gql(token, ATS_MUTATION, { documentDraftId: draftId });

      const saved = await gql<{ resumeAtsScores: SavedScore[] }>(token, ATS_SCORES_QUERY, {
        applicationId,
      });
      expect(saved.data!.resumeAtsScores).toHaveLength(1);
    });

    it('marks the saved result stale once the resume is edited, and re-checking clears it', async () => {
      const token = await register();
      const { applicationId, draftId } = await createResumeDraftIn(token, RESUME_TEXT);
      await gql(token, ATS_MUTATION, { documentDraftId: draftId });

      await gql(token, UPDATE_DRAFT_MUTATION, {
        input: { draftId, contentJson: '{}', plainText: `${RESUME_TEXT}\nSkills\nTypeScript` },
      });
      const stale = await gql<{ resumeAtsScores: SavedScore[] }>(token, ATS_SCORES_QUERY, {
        applicationId,
      });
      expect(stale.data!.resumeAtsScores[0].isStale).toBe(true);

      await gql(token, ATS_MUTATION, { documentDraftId: draftId });
      const fresh = await gql<{ resumeAtsScores: SavedScore[] }>(token, ATS_SCORES_QUERY, {
        applicationId,
      });
      expect(fresh.data!.resumeAtsScores[0].isStale).toBe(false);
    });

    it("does not show another user's saved results", async () => {
      const owner = await register();
      const intruder = await register();
      const { applicationId, draftId } = await createResumeDraftIn(owner, RESUME_TEXT);
      await gql(owner, ATS_MUTATION, { documentDraftId: draftId });

      const res = await gql<{ resumeAtsScores: SavedScore[] }>(intruder, ATS_SCORES_QUERY, {
        applicationId,
      });

      expect(res.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
    });
  });
});
