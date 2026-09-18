import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';

const REGISTER_MUTATION = `
  mutation Register($email: String!, $password: String!) {
    register(email: $email, password: $password)
  }
`;

const LOGIN_MUTATION = `
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      success
      totpRequired
      accessToken
    }
  }
`;

const ME_QUERY = `
  query Me {
    me {
      id
      email
    }
  }
`;

const REFRESH_TOKEN_MUTATION = `
  mutation RefreshToken {
    refreshToken
  }
`;

const LOGOUT_MUTATION = `
  mutation Logout {
    logout
  }
`;

interface GraphQLResponse<T> {
  data: T | null;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

describe('auth integration', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  it('registers a new user and returns a usable access token', async () => {
    const email = `${randomUUID()}@example.com`;

    const registerRes = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: { query: REGISTER_MUTATION, variables: { email, password: 'correct-horse-1' } },
    });
    const registerBody = registerRes.json() as GraphQLResponse<{ register: string }>;
    expect(registerBody.errors).toBeUndefined();
    const accessToken = registerBody.data!.register;
    expect(typeof accessToken).toBe('string');
    expect(accessToken.length).toBeGreaterThan(0);

    const meRes = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { query: ME_QUERY },
    });
    const meBody = meRes.json() as GraphQLResponse<{ me: { id: string; email: string } }>;
    expect(meBody.errors).toBeUndefined();
    expect(meBody.data!.me.email).toBe(email);
  });

  it('logs in with correct credentials and rejects the wrong password', async () => {
    const email = `${randomUUID()}@example.com`;
    const password = 'correct-horse-2';

    await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: { query: REGISTER_MUTATION, variables: { email, password } },
    });

    const loginRes = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: { query: LOGIN_MUTATION, variables: { email, password } },
    });
    const loginBody = loginRes.json() as GraphQLResponse<{
      login: { success: boolean; totpRequired: boolean; accessToken: string | null };
    }>;
    expect(loginBody.errors).toBeUndefined();
    expect(loginBody.data!.login).toEqual({
      success: true,
      totpRequired: false,
      accessToken: expect.any(String),
    });

    const wrongRes = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: { query: LOGIN_MUTATION, variables: { email, password: 'wrong-password' } },
    });
    const wrongBody = wrongRes.json() as GraphQLResponse<{ login: null }>;
    expect(wrongBody.data).toEqual({ login: null });
    expect(wrongBody.errors?.[0]?.extensions?.code).toBe('UNAUTHORIZED');
  });

  it('rejects the me query with no Authorization header', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: { query: ME_QUERY },
    });
    const body = res.json() as GraphQLResponse<{ me: null }>;
    expect(body.data).toEqual({ me: null });
    expect(body.errors?.[0]?.extensions?.code).toBe('UNAUTHORIZED');
  });

  it('issues a new access token from the refresh-token cookie set at login', async () => {
    const email = `${randomUUID()}@example.com`;
    const password = 'correct-horse-3';

    await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: { query: REGISTER_MUTATION, variables: { email, password } },
    });
    const loginRes = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: { query: LOGIN_MUTATION, variables: { email, password } },
    });

    const refreshCookie = loginRes.cookies.find((c) => c.name === 'trakwyn_refresh_token');
    expect(refreshCookie).toBeDefined();

    const refreshRes = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      cookies: { trakwyn_refresh_token: refreshCookie!.value },
      payload: { query: REFRESH_TOKEN_MUTATION },
    });
    const refreshBody = refreshRes.json() as GraphQLResponse<{ refreshToken: string }>;
    expect(refreshBody.errors).toBeUndefined();
    expect(typeof refreshBody.data!.refreshToken).toBe('string');
    expect(refreshBody.data!.refreshToken.length).toBeGreaterThan(0);
  });

  it('rejects refreshToken with no refresh cookie', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: { query: REFRESH_TOKEN_MUTATION },
    });
    const body = res.json() as GraphQLResponse<{ refreshToken: null }>;
    expect(body.data).toEqual({ refreshToken: null });
    expect(body.errors?.[0]?.extensions?.code).toBe('UNAUTHORIZED');
  });

  it('clears auth cookies (including the client-readable trakwyn_logged_in hint) when refreshToken is called with no refresh cookie', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: { query: REFRESH_TOKEN_MUTATION },
    });

    for (const name of ['trakwyn_access_token', 'trakwyn_refresh_token', 'trakwyn_logged_in']) {
      const cookie = res.cookies.find((c) => c.name === name);
      expect(cookie, `expected ${name} to be cleared`).toBeDefined();
      expect(cookie!.value).toBe('');
    }
  });

  it('rejects an access token immediately after logout, instead of honouring it until its natural expiry (JEF-164)', async () => {
    const email = `${randomUUID()}@example.com`;
    const password = 'correct-horse-4';

    const registerRes = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: { query: REGISTER_MUTATION, variables: { email, password } },
    });
    const accessToken = (registerRes.json() as GraphQLResponse<{ register: string }>).data!
      .register;

    // The token works before logout.
    const beforeRes = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { query: ME_QUERY },
    });
    expect((beforeRes.json() as GraphQLResponse<{ me: { email: string } }>).data!.me.email).toBe(
      email,
    );

    const logoutRes = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { query: LOGOUT_MUTATION },
    });
    expect((logoutRes.json() as GraphQLResponse<{ logout: boolean }>).data).toEqual({
      logout: true,
    });

    // Replaying the *same* still-unexpired, still-correctly-signed token —
    // as someone holding a stolen copy would, ignoring the cleared cookie.
    // Before JEF-164 this kept working for up to another 15 minutes.
    const afterRes = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { query: ME_QUERY },
    });
    const afterBody = afterRes.json() as GraphQLResponse<{ me: null }>;
    expect(afterBody.data).toEqual({ me: null });
    expect(afterBody.errors?.[0]?.extensions?.code).toBe('UNAUTHORIZED');
  });

  it('clears auth cookies when the presented refresh token is invalid, so the client stops believing a dead session is alive', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      cookies: { trakwyn_refresh_token: 'not-a-real-token' },
      payload: { query: REFRESH_TOKEN_MUTATION },
    });
    const body = res.json() as GraphQLResponse<{ refreshToken: null }>;
    expect(body.data).toEqual({ refreshToken: null });
    expect(body.errors?.[0]?.extensions?.code).toBe('UNAUTHORIZED');

    for (const name of ['trakwyn_access_token', 'trakwyn_refresh_token', 'trakwyn_logged_in']) {
      const cookie = res.cookies.find((c) => c.name === name);
      expect(cookie, `expected ${name} to be cleared`).toBeDefined();
      expect(cookie!.value).toBe('');
    }
  });
});
