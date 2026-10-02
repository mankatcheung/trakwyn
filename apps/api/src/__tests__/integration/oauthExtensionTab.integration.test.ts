import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';
import { ENV } from '#src/infrastructure/config/constants.js';
import { createPkcePair } from '#src/infrastructure/auth/pkce.js';

/**
 * The browser extension's OAuth login in a browser without
 * `identity.launchWebAuthFlow` (Safari, JEF-386): the same handoff-code flow
 * as JEF-383, but it ends on this API's own done page, which the extension
 * watches its sign-in tab for. Driven end-to-end against FakeOAuthProvider.
 */
const HEADERS = { host: 'localhost:3001' };
const DONE_URL = 'http://localhost:3001/auth/oauth/extension/done';

const EXCHANGE_MUTATION = `
  mutation ExchangeMobileOAuthCode($code: String!, $codeVerifier: String!) {
    exchangeMobileOAuthCode(code: $code, codeVerifier: $codeVerifier) {
      accessToken
      refreshToken
    }
  }
`;

interface GraphQLResponse<T> {
  data: T | null;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

type Cookie = { name: string; value: string };

function cookieJar(cookies: Cookie[]): Record<string, string> {
  return cookies.reduce(
    (jar, cookie) => ({ ...jar, [cookie.name]: cookie.value }),
    {} as Record<string, string>,
  );
}

describe('oauth routes — extension-tab platform (JEF-386)', () => {
  let testApp: TestApp;
  const originalEnv = {
    mode: process.env[ENV.OAUTH_PROVIDER_MODE],
    clientId: process.env[ENV.GOOGLE_OAUTH_CLIENT_ID],
  };

  beforeAll(async () => {
    process.env[ENV.OAUTH_PROVIDER_MODE] = 'fake';
    process.env[ENV.GOOGLE_OAUTH_CLIENT_ID] = 'test-google-client-id';
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    restore(ENV.OAUTH_PROVIDER_MODE, originalEnv.mode);
    restore(ENV.GOOGLE_OAUTH_CLIENT_ID, originalEnv.clientId);
    await testApp.cleanup();
  });

  async function start(params: Record<string, string>) {
    const query = new URLSearchParams({ platform: 'extension-tab', ...params });
    return testApp.app.inject({
      method: 'GET',
      url: `/auth/oauth/google/start?${query}`,
      headers: HEADERS,
    });
  }

  /** Drives start -> fake consent -> callback and returns the final redirect. */
  async function tabLogin(challenge: string): Promise<URL> {
    const startRes = await start({ codeChallenge: challenge });
    expect(startRes.statusCode).toBe(302);

    const consent = await testApp.app.inject({
      method: 'GET',
      url: startRes.headers.location as string,
      headers: HEADERS,
    });
    const callbackUrl = new URL(consent.headers.location as string);

    const callback = await testApp.app.inject({
      method: 'GET',
      url: `${callbackUrl.pathname}${callbackUrl.search}`,
      headers: HEADERS,
      cookies: cookieJar(startRes.cookies as Cookie[]),
    });
    expect(callback.statusCode).toBe(302);
    const setCookies = (callback.cookies as Cookie[]).filter((c) => c.value !== '');
    expect(setCookies.map((c) => c.name)).not.toContain('trakwyn_access_token');
    return new URL(callback.headers.location as string);
  }

  async function exchange(code: string, codeVerifier: string) {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: { query: EXCHANGE_MUTATION, variables: { code, codeVerifier } },
    });
    return res.json() as GraphQLResponse<{
      exchangeMobileOAuthCode: { accessToken: string; refreshToken: string };
    }>;
  }

  it('refuses to start with no codeChallenge', async () => {
    const res = await start({});

    expect(res.statusCode).toBe(400);
  });

  it('needs no extension ID, and keeps none in the redirect cookie', async () => {
    const { challenge } = createPkcePair();

    const res = await start({ codeChallenge: challenge });

    expect(res.statusCode).toBe(302);
    const cookie = (res.cookies as Cookie[]).find((c) => c.name === 'trakwyn_oauth_state');
    const [, , platform, cookieChallenge, extensionId] = cookie!.value.split('.');
    expect(platform).toBe('extension-tab');
    expect(cookieChallenge).toBe(challenge);
    expect(extensionId).toBe('');
  });

  it("hands a successful login to the API's own done page as a handoff code", async () => {
    const { verifier, challenge } = createPkcePair();

    const location = await tabLogin(challenge);

    expect(`${location.origin}${location.pathname}`).toBe(DONE_URL);
    const body = await exchange(location.searchParams.get('code')!, verifier);
    expect(body.errors).toBeUndefined();
    expect(body.data!.exchangeMobileOAuthCode.accessToken).toBeTruthy();
    expect(body.data!.exchangeMobileOAuthCode.refreshToken).toBeTruthy();
  });

  it('will not redeem the handoff code without the matching PKCE verifier', async () => {
    const { challenge } = createPkcePair();
    const location = await tabLogin(challenge);

    const body = await exchange(location.searchParams.get('code')!, createPkcePair().verifier);

    expect(body.errors?.[0]?.extensions?.code).toBe('UNAUTHORIZED');
  });

  it('sends a provider error to the done page too, not the web login page', async () => {
    const startRes = await start({ codeChallenge: createPkcePair().challenge });

    const res = await testApp.app.inject({
      method: 'GET',
      url: '/auth/oauth/google/callback?error=access_denied',
      headers: HEADERS,
      cookies: cookieJar(startRes.cookies as Cookie[]),
    });

    expect(res.headers.location).toBe(`${DONE_URL}?oauthError=access_denied`);
  });

  it('serves a static done page that keeps the code out of caches and referrers', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/auth/oauth/extension/done?code=<script>alert(1)</script>',
      headers: HEADERS,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.body).toContain('You can close this tab');
    expect(res.body).not.toContain('<script>');
  });
});
