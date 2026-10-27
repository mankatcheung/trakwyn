import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';
import type { Cradle } from '#src/http/di/types.js';
import { ENV } from '#src/infrastructure/config/constants.js';
import { ROUTES } from '#src/http/constants.js';
import { CONTENT_LIMITS, PLAN_LIMITS } from '#src/use-cases/constants.js';

const REGISTER_MUTATION = `
  mutation Register($email: String!, $password: String!) {
    register(email: $email, password: $password)
  }
`;

const BILLING_STATUS_QUERY = `
  query BillingStatus {
    billingStatus {
      enforced
      plan
      planExpiresAt
      planSource
      features { notifications analytics offers shareLinks apiAccess mcpAccess }
      limits { applications documentBytes }
      usage { applications documentBytes }
    }
  }
`;

const CREATE_APPLICATION_MUTATION = `
  mutation CreateApplication($input: CreateApplicationInput!) {
    createApplication(input: $input) { id }
  }
`;

const CREATE_SHARE_LINK_MUTATION = `
  mutation CreateShareLink($name: String!) {
    createShareLink(name: $name) { id }
  }
`;

const CHANNEL_ANALYTICS_QUERY = `
  query ChannelAnalytics {
    applicationChannelAnalytics { bySource { label } }
  }
`;

const CREATE_API_TOKEN_MUTATION = `
  mutation CreateApiToken($name: String!, $scope: ApiTokenScope) {
    createApiToken(name: $name, scope: $scope) { id token }
  }
`;

interface GraphQLResponse<T> {
  data: T | null;
  errors?: Array<{ message: string; extensions?: { code?: string; statusCode?: number } }>;
}

async function registerAndLogin(testApp: TestApp): Promise<{ token: string; email: string }> {
  const email = `${randomUUID()}@example.com`;
  const res = await testApp.app.inject({
    method: 'POST',
    url: '/graphql',
    payload: { query: REGISTER_MUTATION, variables: { email, password: 'correct-horse-1' } },
  });
  const body = res.json() as GraphQLResponse<{ register: string }>;
  return { token: body.data!.register, email };
}

function authedInject(
  testApp: TestApp,
  token: string,
  query: string,
  variables?: Record<string, unknown>,
) {
  return testApp.app.inject({
    method: 'POST',
    url: '/graphql',
    headers: { authorization: `Bearer ${token}` },
    payload: { query, variables },
  });
}

describe('plans integration, plans not enforced (the default)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    delete process.env[ENV.PLANS_ENFORCED];
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  it('reports that plans are not enforced and every feature is on', async () => {
    const { token } = await registerAndLogin(testApp);

    const res = await authedInject(testApp, token, BILLING_STATUS_QUERY);
    const body = res.json() as GraphQLResponse<{
      billingStatus: { enforced: boolean; features: Record<string, boolean> };
    }>;

    expect(body.errors).toBeUndefined();
    expect(body.data!.billingStatus.enforced).toBe(false);
    expect(Object.values(body.data!.billingStatus.features).every(Boolean)).toBe(true);
  });

  it('lets a new user use a Pro feature', async () => {
    const { token } = await registerAndLogin(testApp);

    const res = await authedInject(testApp, token, CREATE_SHARE_LINK_MUTATION, {
      name: 'For my coach',
    });
    const body = res.json() as GraphQLResponse<{ createShareLink: { id: string } }>;

    expect(body.errors).toBeUndefined();
    expect(body.data!.createShareLink.id).toBeTruthy();
  });

  it('refuses billingStatus without a session', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: { query: BILLING_STATUS_QUERY },
    });
    const body = res.json() as GraphQLResponse<unknown>;

    expect(body.errors?.[0]?.extensions?.code).toBe('UNAUTHORIZED');
  });
});

describe('plans integration, plans enforced', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    process.env[ENV.PLANS_ENFORCED] = 'true';
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.cleanup();
    delete process.env[ENV.PLANS_ENFORCED];
  });

  it('reports a new user as Free with the Free limits and usage', async () => {
    const { token } = await registerAndLogin(testApp);
    await authedInject(testApp, token, CREATE_APPLICATION_MUTATION, {
      input: { company: 'Acme', role: 'Engineer', status: 'applied' },
    });

    const res = await authedInject(testApp, token, BILLING_STATUS_QUERY);
    const body = res.json() as GraphQLResponse<{
      billingStatus: {
        enforced: boolean;
        plan: string;
        planExpiresAt: string | null;
        planSource: string | null;
        features: Record<string, boolean>;
        limits: { applications: number | null; documentBytes: number };
        usage: { applications: number; documentBytes: number };
      };
    }>;

    expect(body.errors).toBeUndefined();
    expect(body.data!.billingStatus).toEqual({
      enforced: true,
      plan: 'free',
      planExpiresAt: null,
      planSource: null,
      features: {
        notifications: false,
        analytics: false,
        offers: false,
        shareLinks: false,
        apiAccess: false,
        mcpAccess: true,
      },
      limits: {
        applications: CONTENT_LIMITS.APPLICATIONS_PER_USER,
        documentBytes: CONTENT_LIMITS.DOCUMENT_STORAGE_LIMIT_BYTES,
      },
      usage: { applications: 1, documentBytes: 0 },
    });
  });

  it('describes both plans so a client can show the comparison', async () => {
    const { token } = await registerAndLogin(testApp);

    const res = await authedInject(
      testApp,
      token,
      `query {
        billingStatus {
          catalogue {
            free { features { analytics mcpAccess } limits { applications documentBytes } }
            pro { features { analytics mcpAccess } limits { applications documentBytes } }
          }
        }
      }`,
    );
    const body = res.json() as GraphQLResponse<{
      billingStatus: { catalogue: Record<string, unknown> };
    }>;

    expect(body.errors).toBeUndefined();
    expect(body.data!.billingStatus.catalogue).toEqual({
      free: {
        features: { analytics: false, mcpAccess: true },
        limits: {
          applications: CONTENT_LIMITS.APPLICATIONS_PER_USER,
          documentBytes: PLAN_LIMITS.free.documentBytes,
        },
      },
      pro: {
        features: { analytics: true, mcpAccess: true },
        limits: {
          applications: null,
          documentBytes: PLAN_LIMITS.pro.documentBytes,
        },
      },
    });
  });

  it.each([
    ['createShareLink', CREATE_SHARE_LINK_MUTATION, { name: 'For my coach' }],
    ['applicationChannelAnalytics', CHANNEL_ANALYTICS_QUERY, undefined],
  ])('refuses %s to a Free user with PLAN_REQUIRED (403)', async (_name, query, variables) => {
    const { token } = await registerAndLogin(testApp);

    const res = await authedInject(testApp, token, query, variables);
    const body = res.json() as GraphQLResponse<unknown>;

    expect(body.errors?.[0]?.extensions?.code).toBe('PLAN_REQUIRED');
    expect(body.errors?.[0]?.extensions?.statusCode).toBe(403);
  });

  describe('API tokens and MCP on the Free plan (JEF-442)', () => {
    async function freeUserWithToken(scope: 'read' | 'full') {
      const { token } = await registerAndLogin(testApp);
      const res = await authedInject(testApp, token, CREATE_API_TOKEN_MUTATION, {
        name: 'My MCP client',
        scope,
      });
      const body = res.json() as GraphQLResponse<{ createApiToken: { token: string } }>;
      expect(body.errors).toBeUndefined();
      return body.data!.createApiToken.token;
    }

    it('lets a Free user create a token and use it on MCP', async () => {
      const apiToken = await freeUserWithToken('full');

      const res = await testApp.app.inject({
        method: 'POST',
        url: ROUTES.MCP,
        headers: { authorization: `Bearer ${apiToken}` },
        payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      });

      expect(res.statusCode).toBe(200);
      expect((res.json() as { error?: unknown }).error).toBeUndefined();
    });

    it('refuses that same token on the GraphQL API, which needs API access', async () => {
      const apiToken = await freeUserWithToken('full');

      const res = await authedInject(testApp, apiToken, BILLING_STATUS_QUERY);
      const body = res.json() as GraphQLResponse<unknown>;

      expect(body.errors?.[0]?.extensions?.code).toBe('UNAUTHORIZED');
    });
  });

  it('still lets a Free user do everything in the Free column', async () => {
    const { token } = await registerAndLogin(testApp);

    const res = await authedInject(testApp, token, CREATE_APPLICATION_MUTATION, {
      input: { company: 'Acme', role: 'Engineer', status: 'applied' },
    });
    const body = res.json() as GraphQLResponse<{ createApplication: { id: string } }>;

    expect(body.errors).toBeUndefined();
    expect(body.data!.createApplication.id).toBeTruthy();
  });

  it('unlocks the Pro features once the operator puts the user on Pro, and relocks them when it ends', async () => {
    const { token, email } = await registerAndLogin(testApp);
    const { userRepository } = testApp.app.diContainer.cradle as unknown as Pick<
      Cradle,
      'userRepository'
    >;
    const user = await userRepository.findByEmail(email);

    await userRepository.update(user!.id, {
      plan: 'pro',
      planSource: 'grant',
      planExpiresAt: new Date(Date.now() + 60_000),
    });
    const proRes = await authedInject(testApp, token, CREATE_SHARE_LINK_MUTATION, { name: 'x' });
    expect((proRes.json() as GraphQLResponse<unknown>).errors).toBeUndefined();

    const status = await authedInject(testApp, token, BILLING_STATUS_QUERY);
    const statusBody = status.json() as GraphQLResponse<{
      billingStatus: { plan: string; planSource: string; planExpiresAt: string };
    }>;
    expect(statusBody.data!.billingStatus).toMatchObject({ plan: 'pro', planSource: 'grant' });
    expect(statusBody.data!.billingStatus.planExpiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    await userRepository.update(user!.id, { planExpiresAt: new Date(Date.now() - 1_000) });
    const expiredRes = await authedInject(testApp, token, CREATE_SHARE_LINK_MUTATION, {
      name: 'y',
    });
    expect((expiredRes.json() as GraphQLResponse<unknown>).errors?.[0]?.extensions?.code).toBe(
      'PLAN_REQUIRED',
    );
  });
});
