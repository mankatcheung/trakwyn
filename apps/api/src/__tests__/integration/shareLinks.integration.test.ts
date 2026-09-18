import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';

const REGISTER_MUTATION = `
  mutation Register($email: String!, $password: String!) {
    register(email: $email, password: $password)
  }
`;

const CREATE_APPLICATION_MUTATION = `
  mutation CreateApplication($input: CreateApplicationInput!) {
    createApplication(input: $input) {
      id
    }
  }
`;

const CREATE_SHARE_LINK_MUTATION = `
  mutation CreateShareLink($name: String!) {
    createShareLink(name: $name) {
      id
      name
      token
    }
  }
`;

const SHARE_LINKS_QUERY = `
  query ShareLinks {
    shareLinks {
      id
      name
    }
  }
`;

const DELETE_SHARE_LINK_MUTATION = `
  mutation DeleteShareLink($id: ID!) {
    deleteShareLink(id: $id)
  }
`;

const SHARED_SUMMARY_QUERY = `
  query SharedSummary($token: String!) {
    sharedSummary(token: $token) {
      totalApplications
      statusCounts {
        status
        count
      }
    }
  }
`;

interface GraphQLResponse<T> {
  data: T | null;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

describe('shareLinks integration', () => {
  let testApp: TestApp;

  async function registerAndLogin(): Promise<string> {
    const email = `${randomUUID()}@example.com`;
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: { query: REGISTER_MUTATION, variables: { email, password: 'correct-horse-1' } },
    });
    const body = res.json() as GraphQLResponse<{ register: string }>;
    return body.data!.register;
  }

  function authedInject(token: string, query: string, variables?: Record<string, unknown>) {
    return testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      headers: { authorization: `Bearer ${token}` },
      payload: { query, variables },
    });
  }

  function anonInject(query: string, variables?: Record<string, unknown>) {
    return testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: { query, variables },
    });
  }

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  it('an anonymous client (no Authorization header at all) can read a share link created by an authenticated user', async () => {
    const token = await registerAndLogin();

    // Give this user one application so the summary has something to count.
    await authedInject(token, CREATE_APPLICATION_MUTATION, {
      input: { company: 'Acme Corp', role: 'Staff Engineer', status: 'applied' },
    });

    const createRes = await authedInject(token, CREATE_SHARE_LINK_MUTATION, {
      name: 'For my mentor',
    });
    const createBody = createRes.json() as GraphQLResponse<{
      createShareLink: { id: string; name: string; token: string };
    }>;
    expect(createBody.errors).toBeUndefined();
    const rawToken = createBody.data!.createShareLink.token;
    expect(rawToken).toMatch(/^jfsl_/);

    // The defining assertion: this request carries no Authorization header
    // and no cookie — this is exactly the unauthenticated-query wiring a
    // fully-mocked resolver unit test can't verify end-to-end.
    const summaryRes = await anonInject(SHARED_SUMMARY_QUERY, { token: rawToken });
    const summaryBody = summaryRes.json() as GraphQLResponse<{
      sharedSummary: {
        totalApplications: number;
        statusCounts: Array<{ status: string; count: number }>;
      };
    }>;
    expect(summaryBody.errors).toBeUndefined();
    expect(summaryBody.data!.sharedSummary.totalApplications).toBe(1);
    expect(summaryBody.data!.sharedSummary.statusCounts).toEqual(
      expect.arrayContaining([{ status: 'applied', count: 1 }]),
    );
  });

  it('returns null for an unknown token, without an auth error (no user enumeration)', async () => {
    const res = await anonInject(SHARED_SUMMARY_QUERY, { token: 'jfsl_does_not_exist' });
    const body = res.json() as GraphQLResponse<{ sharedSummary: null }>;
    expect(body.errors).toBeUndefined();
    expect(body.data).toEqual({ sharedSummary: null });
  });

  it('stops resolving immediately after the link is revoked', async () => {
    const token = await registerAndLogin();

    const createRes = await authedInject(token, CREATE_SHARE_LINK_MUTATION, {
      name: 'Revoke me',
    });
    const createBody = createRes.json() as GraphQLResponse<{
      createShareLink: { id: string; token: string };
    }>;
    const { id, token: rawToken } = createBody.data!.createShareLink;

    const beforeRevoke = await anonInject(SHARED_SUMMARY_QUERY, { token: rawToken });
    const beforeBody = beforeRevoke.json() as GraphQLResponse<{ sharedSummary: unknown }>;
    expect(beforeBody.data!.sharedSummary).not.toBeNull();

    const deleteRes = await authedInject(token, DELETE_SHARE_LINK_MUTATION, { id });
    const deleteBody = deleteRes.json() as GraphQLResponse<{ deleteShareLink: boolean }>;
    expect(deleteBody.data!.deleteShareLink).toBe(true);

    const afterRevoke = await anonInject(SHARED_SUMMARY_QUERY, { token: rawToken });
    const afterBody = afterRevoke.json() as GraphQLResponse<{ sharedSummary: null }>;
    expect(afterBody.data).toEqual({ sharedSummary: null });
  });

  it('rejects the shareLinks list query with no Authorization header', async () => {
    const res = await anonInject(SHARE_LINKS_QUERY);
    const body = res.json() as GraphQLResponse<{ shareLinks: null }>;
    expect(body.data).toEqual({ shareLinks: null });
    expect(body.errors?.[0]?.extensions?.code).toBe('UNAUTHORIZED');
  });
});
