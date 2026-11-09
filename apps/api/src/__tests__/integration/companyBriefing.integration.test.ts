import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';
import type { Cradle } from '#src/http/container.js';

const REGISTER_MUTATION = `
  mutation Register($email: String!, $password: String!) {
    register(email: $email, password: $password)
  }
`;

const CREATE_APPLICATION_MUTATION = `
  mutation CreateApplication($input: CreateApplicationInput!) {
    createApplication(input: $input) { id }
  }
`;

const BRIEFING_QUERY = `
  query CompanyBriefing($applicationId: ID!) {
    companyBriefing(applicationId: $applicationId) {
      id
      applicationId
      content
      sources { url title publishedAt }
      generatedAt
    }
  }
`;

const DELETE_APPLICATION_MUTATION = `
  mutation DeleteApplication($id: ID!) {
    deleteApplication(id: $id)
  }
`;

interface GraphQLResponse<T> {
  data: T | null;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

type Briefing = {
  id: string;
  applicationId: string;
  content: string;
  sources: Array<{ url: string; title: string; publishedAt: string | null }>;
  generatedAt: string;
} | null;

/**
 * The model call itself is not exercised here — there is no provider to call
 * in a test. What matters for JEF-195 is the half that was missing: that a
 * briefing, once stored, is still there on the next request instead of having
 * lived in component state. So these seed through the app's own repository and
 * drive the read path over real GraphQL.
 */
describe('company briefing integration', () => {
  let testApp: TestApp;

  async function registerAndLogin(): Promise<string> {
    const email = `${randomUUID()}@example.com`;
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: { query: REGISTER_MUTATION, variables: { email, password: 'Password123!' } },
    });
    const cookies = res.cookies as Array<{ name: string; value: string }>;
    return cookies.find((c) => c.name === 'trakwyn_access_token')!.value;
  }

  const authedInject = (token: string, query: string, variables?: Record<string, unknown>) =>
    testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      cookies: { trakwyn_access_token: token },
      payload: { query, variables },
    });

  async function createApplication(token: string): Promise<string> {
    const res = await authedInject(token, CREATE_APPLICATION_MUTATION, {
      input: { company: 'Acme', role: 'Engineer', status: 'applied' },
    });
    return (res.json() as GraphQLResponse<{ createApplication: { id: string } }>).data!
      .createApplication.id;
  }

  const briefingRepository = () =>
    (testApp.app as unknown as { diContainer: { cradle: Cradle } }).diContainer.cradle
      .companyBriefingRepository;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(() => testApp.cleanup());

  it('reports no briefing before one has been generated', async () => {
    const token = await registerAndLogin();
    const applicationId = await createApplication(token);

    const res = await authedInject(token, BRIEFING_QUERY, { applicationId });
    const body = res.json() as GraphQLResponse<{ companyBriefing: Briefing }>;

    expect(body.errors).toBeUndefined();
    expect(body.data!.companyBriefing).toBeNull();
  });

  it('serves a stored briefing back on a later request', async () => {
    const token = await registerAndLogin();
    const applicationId = await createApplication(token);

    await briefingRepository().upsert({
      id: randomUUID(),
      applicationId,
      content: 'Company overview…',
      sources: [],
      generatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });

    const res = await authedInject(token, BRIEFING_QUERY, { applicationId });
    const briefing = (res.json() as GraphQLResponse<{ companyBriefing: Briefing }>).data!
      .companyBriefing;

    expect(briefing).toMatchObject({ applicationId, content: 'Company overview…' });
    expect(briefing!.generatedAt).toBe('2026-08-01T00:00:00.000Z');
  });

  it('serves the sources a briefing was written from, in the order they are cited', async () => {
    const token = await registerAndLogin();
    const applicationId = await createApplication(token);
    const sources = [
      { url: 'https://acme.com', title: 'Acme | Payroll' },
      { url: 'https://acme.com/about', title: 'About Acme' },
    ];

    await briefingRepository().upsert({
      id: randomUUID(),
      applicationId,
      content: 'Acme sells payroll software [1].',
      sources,
      generatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });

    const res = await authedInject(token, BRIEFING_QUERY, { applicationId });
    const body = res.json() as GraphQLResponse<{ companyBriefing: Briefing }>;

    expect(body.errors).toBeUndefined();
    // The company's own pages have no date, so a client reads null (JEF-538).
    expect(body.data!.companyBriefing!.sources).toEqual(
      sources.map((source) => ({ ...source, publishedAt: null })),
    );
  });

  it('serves when a web search source was published, and null for one with no date', async () => {
    const token = await registerAndLogin();
    const applicationId = await createApplication(token);

    await briefingRepository().upsert({
      id: randomUUID(),
      applicationId,
      content: 'Acme raised a Series B, reported March 2026 [2].',
      sources: [
        { url: 'https://acme.com', title: 'Acme | Payroll' },
        {
          url: 'https://news.example/acme',
          title: 'Acme raises Series B',
          publishedAt: '2026-03-12T00:00:00.000Z',
        },
        { url: 'https://reviews.example/acme', title: 'Acme reviews', publishedAt: null },
      ],
      generatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });

    const res = await authedInject(token, BRIEFING_QUERY, { applicationId });
    const body = res.json() as GraphQLResponse<{ companyBriefing: Briefing }>;

    expect(body.errors).toBeUndefined();
    expect(body.data!.companyBriefing!.sources.map((s) => s.publishedAt)).toEqual([
      null,
      '2026-03-12T00:00:00.000Z',
      null,
    ]);
  });

  it('serves an empty list, not null, for a briefing with no sources', async () => {
    const token = await registerAndLogin();
    const applicationId = await createApplication(token);

    await briefingRepository().upsert({
      id: randomUUID(),
      applicationId,
      content: 'From general knowledge.',
      sources: [],
      generatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });

    const res = await authedInject(token, BRIEFING_QUERY, { applicationId });
    const body = res.json() as GraphQLResponse<{ companyBriefing: Briefing }>;

    expect(body.errors).toBeUndefined();
    expect(body.data!.companyBriefing!.sources).toEqual([]);
  });

  it('regenerating replaces the briefing rather than adding a second', async () => {
    const token = await registerAndLogin();
    const applicationId = await createApplication(token);

    await briefingRepository().upsert({
      id: randomUUID(),
      applicationId,
      content: 'First',
      sources: [],
      generatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    await briefingRepository().upsert({
      id: randomUUID(),
      applicationId,
      content: 'Second',
      sources: [],
      generatedAt: new Date('2026-08-02T00:00:00.000Z'),
    });

    const res = await authedInject(token, BRIEFING_QUERY, { applicationId });
    const briefing = (res.json() as GraphQLResponse<{ companyBriefing: Briefing }>).data!
      .companyBriefing;

    expect(briefing!.content).toBe('Second');
    expect(briefing!.generatedAt).toBe('2026-08-02T00:00:00.000Z');
  });

  it("does not serve another user's briefing", async () => {
    const owner = await registerAndLogin();
    const applicationId = await createApplication(owner);
    await briefingRepository().upsert({
      id: randomUUID(),
      applicationId,
      content: 'Private research',
      sources: [],
      generatedAt: new Date(),
    });

    const attacker = await registerAndLogin();
    const res = await authedInject(attacker, BRIEFING_QUERY, { applicationId });

    expect((res.json() as GraphQLResponse<unknown>).errors?.[0]?.extensions?.code).toBe(
      'FORBIDDEN',
    );
  });

  it('stops serving the briefing once the application is in Trash', async () => {
    const token = await registerAndLogin();
    const applicationId = await createApplication(token);
    await briefingRepository().upsert({
      id: randomUUID(),
      applicationId,
      content: 'Overview',
      sources: [],
      generatedAt: new Date(),
    });

    await authedInject(token, DELETE_APPLICATION_MUTATION, { id: applicationId });

    // The read goes through the trash-filtered findById, so a trashed
    // application reports as missing rather than serving its research.
    const res = await authedInject(token, BRIEFING_QUERY, { applicationId });
    expect((res.json() as GraphQLResponse<unknown>).errors?.[0]?.extensions?.code).toBe(
      'NOT_FOUND',
    );
  });
});
