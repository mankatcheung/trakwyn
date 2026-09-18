import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';

const REGISTER_MOBILE_MUTATION = `
  mutation RegisterMobile($email: String!, $password: String!) {
    registerMobile(email: $email, password: $password) {
      accessToken
    }
  }
`;

const REGISTER_EXPO_PUSH_TOKEN_MUTATION = `
  mutation RegisterExpoPushToken($token: String!) {
    registerExpoPushToken(token: $token)
  }
`;

const UNREGISTER_PUSH_SUBSCRIPTION_MUTATION = `
  mutation UnregisterPushSubscription($endpoint: String!) {
    unregisterPushSubscription(endpoint: $endpoint)
  }
`;

interface GraphQLResponse<T> {
  data: T | null;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

async function registerAndGetAccessToken(app: TestApp['app']): Promise<string> {
  const email = `${randomUUID()}@example.com`;
  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    payload: {
      query: REGISTER_MOBILE_MUTATION,
      variables: { email, password: 'correct-horse-1' },
    },
  });
  return (res.json() as GraphQLResponse<{ registerMobile: { accessToken: string } }>).data!
    .registerMobile.accessToken;
}

describe('push subscriptions integration', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  it('registers an expo push token and can unregister it via the shared mutation', async () => {
    const accessToken = await registerAndGetAccessToken(testApp.app);

    const registerRes = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        query: REGISTER_EXPO_PUSH_TOKEN_MUTATION,
        variables: { token: 'ExponentPushToken[abc123]' },
      },
    });
    const registerBody = registerRes.json() as GraphQLResponse<{
      registerExpoPushToken: boolean;
    }>;
    expect(registerBody.errors).toBeUndefined();
    expect(registerBody.data!.registerExpoPushToken).toBe(true);

    const unregisterRes = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        query: UNREGISTER_PUSH_SUBSCRIPTION_MUTATION,
        variables: { endpoint: 'ExponentPushToken[abc123]' },
      },
    });
    const unregisterBody = unregisterRes.json() as GraphQLResponse<{
      unregisterPushSubscription: boolean;
    }>;
    expect(unregisterBody.errors).toBeUndefined();
    expect(unregisterBody.data!.unregisterPushSubscription).toBe(true);
  });

  it('rejects registerExpoPushToken with no Authorization header', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: {
        query: REGISTER_EXPO_PUSH_TOKEN_MUTATION,
        variables: { token: 'ExponentPushToken[abc123]' },
      },
    });
    const body = res.json() as GraphQLResponse<{ registerExpoPushToken: null }>;
    expect(body.data).toEqual({ registerExpoPushToken: null });
    expect(body.errors?.[0]?.extensions?.code).toBe('UNAUTHORIZED');
  });

  it('re-registering the same token for a different user reassigns it (upsert by endpoint)', async () => {
    const firstUserToken = await registerAndGetAccessToken(testApp.app);
    const secondUserToken = await registerAndGetAccessToken(testApp.app);

    await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      headers: { authorization: `Bearer ${firstUserToken}` },
      payload: {
        query: REGISTER_EXPO_PUSH_TOKEN_MUTATION,
        variables: { token: 'ExponentPushToken[shared]' },
      },
    });

    const secondRes = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      headers: { authorization: `Bearer ${secondUserToken}` },
      payload: {
        query: REGISTER_EXPO_PUSH_TOKEN_MUTATION,
        variables: { token: 'ExponentPushToken[shared]' },
      },
    });
    const secondBody = secondRes.json() as GraphQLResponse<{ registerExpoPushToken: boolean }>;
    expect(secondBody.errors).toBeUndefined();
    expect(secondBody.data!.registerExpoPushToken).toBe(true);
  });
});
