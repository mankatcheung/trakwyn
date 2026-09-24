import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';
import { createPkcePair } from '#src/infrastructure/auth/pkce.js';

const REGISTER_MOBILE_MUTATION = `
  mutation RegisterMobile($email: String!, $password: String!) {
    registerMobile(email: $email, password: $password) {
      accessToken
      refreshToken
    }
  }
`;

const LOGIN_MOBILE_MUTATION = `
  mutation LoginMobile($email: String!, $password: String!) {
    loginMobile(email: $email, password: $password) {
      success
      totpRequired
      accessToken
      refreshToken
    }
  }
`;

const REFRESH_TOKEN_MOBILE_MUTATION = `
  mutation RefreshTokenMobile($refreshToken: String!) {
    refreshTokenMobile(refreshToken: $refreshToken) {
      accessToken
      refreshToken
    }
  }
`;

const REAUTHENTICATE_MOBILE_MUTATION = `
  mutation ReauthenticateMobile($password: String!, $code: String) {
    reauthenticateMobile(password: $password, code: $code) {
      success
      totpRequired
      accessToken
      refreshToken
    }
  }
`;

const EXCHANGE_MOBILE_OAUTH_CODE_MUTATION = `
  mutation ExchangeMobileOAuthCode($code: String!, $codeVerifier: String!) {
    exchangeMobileOAuthCode(code: $code, codeVerifier: $codeVerifier) {
      accessToken
      refreshToken
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

interface GraphQLResponse<T> {
  data: T | null;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

const COOKIE_NAMES = ['trakwyn_access_token', 'trakwyn_refresh_token', 'trakwyn_logged_in'];

describe('mobile auth integration', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  it('registers a new user and returns a usable access + refresh token pair, without setting cookies', async () => {
    const email = `${randomUUID()}@example.com`;

    const registerRes = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: {
        query: REGISTER_MOBILE_MUTATION,
        variables: { email, password: 'correct-horse-1' },
      },
    });
    const registerBody = registerRes.json() as GraphQLResponse<{
      registerMobile: { accessToken: string; refreshToken: string };
    }>;
    expect(registerBody.errors).toBeUndefined();
    const { accessToken, refreshToken } = registerBody.data!.registerMobile;
    expect(typeof accessToken).toBe('string');
    expect(typeof refreshToken).toBe('string');
    expect(accessToken.length).toBeGreaterThan(0);
    expect(refreshToken.length).toBeGreaterThan(0);

    for (const name of COOKIE_NAMES) {
      expect(registerRes.cookies.find((c) => c.name === name)).toBeUndefined();
    }

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
      payload: {
        query: `mutation Register($email: String!, $password: String!) { register(email: $email, password: $password) }`,
        variables: { email, password },
      },
    });

    const loginRes = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: { query: LOGIN_MOBILE_MUTATION, variables: { email, password } },
    });
    const loginBody = loginRes.json() as GraphQLResponse<{
      loginMobile: {
        success: boolean;
        totpRequired: boolean;
        accessToken: string | null;
        refreshToken: string | null;
      };
    }>;
    expect(loginBody.errors).toBeUndefined();
    expect(loginBody.data!.loginMobile).toEqual({
      success: true,
      totpRequired: false,
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });
    for (const name of COOKIE_NAMES) {
      expect(loginRes.cookies.find((c) => c.name === name)).toBeUndefined();
    }

    const wrongRes = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: { query: LOGIN_MOBILE_MUTATION, variables: { email, password: 'wrong-password' } },
    });
    const wrongBody = wrongRes.json() as GraphQLResponse<{ loginMobile: null }>;
    expect(wrongBody.data).toEqual({ loginMobile: null });
    expect(wrongBody.errors?.[0]?.extensions?.code).toBe('UNAUTHORIZED');
  });

  it('rotates the refresh token and issues a new usable access token', async () => {
    const email = `${randomUUID()}@example.com`;
    const password = 'correct-horse-3';

    const registerRes = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: { query: REGISTER_MOBILE_MUTATION, variables: { email, password } },
    });
    const { refreshToken } = (
      registerRes.json() as GraphQLResponse<{
        registerMobile: { accessToken: string; refreshToken: string };
      }>
    ).data!.registerMobile;

    const refreshRes = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: { query: REFRESH_TOKEN_MOBILE_MUTATION, variables: { refreshToken } },
    });
    const refreshBody = refreshRes.json() as GraphQLResponse<{
      refreshTokenMobile: { accessToken: string; refreshToken: string };
    }>;
    expect(refreshBody.errors).toBeUndefined();
    expect(typeof refreshBody.data!.refreshTokenMobile.accessToken).toBe('string');
    expect(typeof refreshBody.data!.refreshTokenMobile.refreshToken).toBe('string');

    const meRes = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      headers: { authorization: `Bearer ${refreshBody.data!.refreshTokenMobile.accessToken}` },
      payload: { query: ME_QUERY },
    });
    expect((meRes.json() as GraphQLResponse<{ me: { email: string } }>).data!.me.email).toBe(email);
  });

  it('rejects refreshTokenMobile with an invalid refresh token', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: {
        query: REFRESH_TOKEN_MOBILE_MUTATION,
        variables: { refreshToken: 'not-a-real-token' },
      },
    });
    const body = res.json() as GraphQLResponse<{ refreshTokenMobile: null }>;
    expect(body.data).toEqual({ refreshTokenMobile: null });
    expect(body.errors?.[0]?.extensions?.code).toBe('UNAUTHORIZED');
  });

  it('reauthenticateMobile re-signs the current session with a fresh token pair, without cookies, and rejects the wrong password', async () => {
    const email = `${randomUUID()}@example.com`;
    const password = 'correct-horse-5';

    const registerRes = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: { query: REGISTER_MOBILE_MUTATION, variables: { email, password } },
    });
    const { accessToken } = (
      registerRes.json() as GraphQLResponse<{
        registerMobile: { accessToken: string; refreshToken: string };
      }>
    ).data!.registerMobile;

    const reauthRes = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { query: REAUTHENTICATE_MOBILE_MUTATION, variables: { password } },
    });
    const reauthBody = reauthRes.json() as GraphQLResponse<{
      reauthenticateMobile: {
        success: boolean;
        totpRequired: boolean;
        accessToken: string | null;
        refreshToken: string | null;
      };
    }>;
    expect(reauthBody.errors).toBeUndefined();
    expect(reauthBody.data!.reauthenticateMobile).toEqual({
      success: true,
      totpRequired: false,
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });
    for (const name of COOKIE_NAMES) {
      expect(reauthRes.cookies.find((c) => c.name === name)).toBeUndefined();
    }

    // The re-signed access token belongs to the same account.
    const meRes = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      headers: { authorization: `Bearer ${reauthBody.data!.reauthenticateMobile.accessToken}` },
      payload: { query: ME_QUERY },
    });
    expect((meRes.json() as GraphQLResponse<{ me: { email: string } }>).data!.me.email).toBe(email);

    const wrongRes = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        query: REAUTHENTICATE_MOBILE_MUTATION,
        variables: { password: 'wrong-password' },
      },
    });
    const wrongBody = wrongRes.json() as GraphQLResponse<{ reauthenticateMobile: null }>;
    expect(wrongBody.data).toEqual({ reauthenticateMobile: null });
    expect(wrongBody.errors?.[0]?.extensions?.code).toBe('UNAUTHORIZED');

    const anonRes = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: { query: REAUTHENTICATE_MOBILE_MUTATION, variables: { password } },
    });
    const anonBody = anonRes.json() as GraphQLResponse<{ reauthenticateMobile: null }>;
    expect(anonBody.errors?.[0]?.extensions?.code).toBe('UNAUTHORIZED');
  });

  it('exchangeMobileOAuthCode redeems a handoff code from the OAuth callback for a usable token pair', async () => {
    // The callback itself (oauth.routes.integration.test.ts) already covers
    // minting this code and sending it to trakwyn://oauth-callback — this
    // covers the app's side of the handoff: redeeming what it received.
    const { mobileOAuthHandoffService } = (
      testApp.app as unknown as {
        diContainer: {
          cradle: {
            mobileOAuthHandoffService: { issue: (a: string, r: string, c: string) => string };
          };
        };
      }
    ).diContainer.cradle;
    const { verifier, challenge } = createPkcePair();
    const code = mobileOAuthHandoffService.issue(
      'access-from-oauth',
      'refresh-from-oauth',
      challenge,
    );

    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: {
        query: EXCHANGE_MOBILE_OAUTH_CODE_MUTATION,
        variables: { code, codeVerifier: verifier },
      },
    });

    const body = res.json() as GraphQLResponse<{
      exchangeMobileOAuthCode: { accessToken: string; refreshToken: string };
    }>;
    expect(body.errors).toBeUndefined();
    expect(body.data!.exchangeMobileOAuthCode).toEqual({
      accessToken: 'access-from-oauth',
      refreshToken: 'refresh-from-oauth',
    });
    for (const name of COOKIE_NAMES) {
      expect(res.cookies.find((c) => c.name === name)).toBeUndefined();
    }
  });

  it('exchangeMobileOAuthCode rejects an invalid code', async () => {
    const { verifier } = createPkcePair();
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: {
        query: EXCHANGE_MOBILE_OAUTH_CODE_MUTATION,
        variables: { code: 'not-a-real-code', codeVerifier: verifier },
      },
    });

    const body = res.json() as GraphQLResponse<{ exchangeMobileOAuthCode: null }>;
    expect(body.data).toEqual({ exchangeMobileOAuthCode: null });
    expect(body.errors?.[0]?.extensions?.code).toBe('UNAUTHORIZED');
  });

  it('exchangeMobileOAuthCode rejects a code redeemed with the wrong PKCE verifier', async () => {
    // Proof the PKCE binding is actually enforced end-to-end, not just at the
    // unit level: a genuine handoff code, presented with a verifier that was
    // never used to derive its challenge.
    const { mobileOAuthHandoffService } = (
      testApp.app as unknown as {
        diContainer: {
          cradle: {
            mobileOAuthHandoffService: { issue: (a: string, r: string, c: string) => string };
          };
        };
      }
    ).diContainer.cradle;
    const { challenge } = createPkcePair();
    const { verifier: wrongVerifier } = createPkcePair();
    const code = mobileOAuthHandoffService.issue(
      'access-from-oauth',
      'refresh-from-oauth',
      challenge,
    );

    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: {
        query: EXCHANGE_MOBILE_OAUTH_CODE_MUTATION,
        variables: { code, codeVerifier: wrongVerifier },
      },
    });

    const body = res.json() as GraphQLResponse<{ exchangeMobileOAuthCode: null }>;
    expect(body.data).toEqual({ exchangeMobileOAuthCode: null });
    expect(body.errors?.[0]?.extensions?.code).toBe('UNAUTHORIZED');
  });
});
