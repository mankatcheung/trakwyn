import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';
import { ENV } from '#src/infrastructure/config/constants.js';
import { createPkcePair } from '#src/infrastructure/auth/pkce.js';

/**
 * The browser extension's OAuth login (JEF-383): the same handoff-code flow as
 * mobile, but handed back to `https://<id>.chromiumapp.org/`, and only for an
 * allowlisted extension ID. Driven end-to-end against FakeOAuthProvider.
 */
const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';
const OTHER_EXTENSION_ID = 'ponmlkjihgfedcbaponmlkjihgfedcba';
const EXTENSION_REDIRECT = `https://${EXTENSION_ID}.chromiumapp.org/`;
const HEADERS = { host: 'localhost:3001' };

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

describe('oauth routes — extension platform (JEF-383)', () => {
  let testApp: TestApp;
  const originalEnv = {
    mode: process.env[ENV.OAUTH_PROVIDER_MODE],
    clientId: process.env[ENV.GOOGLE_OAUTH_CLIENT_ID],
    extensionIds: process.env[ENV.EXTENSION_OAUTH_IDS],
  };

  beforeAll(async () => {
    process.env[ENV.OAUTH_PROVIDER_MODE] = 'fake';
    process.env[ENV.GOOGLE_OAUTH_CLIENT_ID] = 'test-google-client-id';
    // Set before buildTestApp: the allowlist is read when the container
    // first resolves it.
    process.env[ENV.EXTENSION_OAUTH_IDS] = `${EXTENSION_ID}, not-an-extension-id`;
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    restore(ENV.OAUTH_PROVIDER_MODE, originalEnv.mode);
    restore(ENV.GOOGLE_OAUTH_CLIENT_ID, originalEnv.clientId);
    restore(ENV.EXTENSION_OAUTH_IDS, originalEnv.extensionIds);
    await testApp.cleanup();
  });

  function startUrl(params: Record<string, string>): string {
    return `/auth/oauth/google/start?${new URLSearchParams({ platform: 'extension', ...params })}`;
  }

  async function start(params: Record<string, string>) {
    return testApp.app.inject({ method: 'GET', url: startUrl(params), headers: HEADERS });
  }

  /** Drives start -> fake consent -> callback and returns the final redirect. */
  async function extensionLogin(challenge: string): Promise<URL> {
    const startRes = await start({ codeChallenge: challenge, extensionId: EXTENSION_ID });
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
    const res = await start({ extensionId: EXTENSION_ID });

    expect(res.statusCode).toBe(400);
  });

  it('refuses to start with a malformed codeChallenge', async () => {
    const res = await start({ codeChallenge: 'too-short', extensionId: EXTENSION_ID });

    expect(res.statusCode).toBe(400);
  });

  it('refuses to start with no extensionId', async () => {
    const res = await start({ codeChallenge: createPkcePair().challenge });

    expect(res.statusCode).toBe(400);
  });

  it('refuses to start for an extension that is not on the allowlist', async () => {
    const res = await start({
      codeChallenge: createPkcePair().challenge,
      extensionId: OTHER_EXTENSION_ID,
    });

    expect(res.statusCode).toBe(400);
  });

  it('never allowlists a malformed entry from the env var', async () => {
    const res = await start({
      codeChallenge: createPkcePair().challenge,
      extensionId: 'not-an-extension-id',
    });

    expect(res.statusCode).toBe(400);
  });

  it('carries the platform, challenge and extension ID in the redirect cookie', async () => {
    const { challenge } = createPkcePair();

    const res = await start({ codeChallenge: challenge, extensionId: EXTENSION_ID });

    const cookie = (res.cookies as Cookie[]).find((c) => c.name === 'trakwyn_oauth_state');
    const [, , platform, cookieChallenge, extensionId] = cookie!.value.split('.');
    expect(platform).toBe('extension');
    expect(cookieChallenge).toBe(challenge);
    expect(extensionId).toBe(EXTENSION_ID);
  });

  it('hands a successful login back to the extension as a handoff code, not cookies', async () => {
    const { verifier, challenge } = createPkcePair();

    const location = await extensionLogin(challenge);

    expect(`${location.origin}${location.pathname}`).toBe(EXTENSION_REDIRECT);
    const code = location.searchParams.get('code');
    expect(code).toBeTruthy();

    const body = await exchange(code!, verifier);
    expect(body.errors).toBeUndefined();
    expect(body.data!.exchangeMobileOAuthCode.accessToken).toBeTruthy();
    expect(body.data!.exchangeMobileOAuthCode.refreshToken).toBeTruthy();
  });

  it('will not redeem the handoff code without the matching PKCE verifier', async () => {
    const { challenge } = createPkcePair();
    const location = await extensionLogin(challenge);

    const body = await exchange(location.searchParams.get('code')!, createPkcePair().verifier);

    expect(body.errors?.[0]?.extensions?.code).toBe('UNAUTHORIZED');
  });

  it('sends a provider error back to the extension, not the web login page', async () => {
    const startRes = await start({
      codeChallenge: createPkcePair().challenge,
      extensionId: EXTENSION_ID,
    });

    const res = await testApp.app.inject({
      method: 'GET',
      url: '/auth/oauth/google/callback?error=access_denied',
      headers: HEADERS,
      cookies: cookieJar(startRes.cookies as Cookie[]),
    });

    expect(res.headers.location).toBe(`${EXTENSION_REDIRECT}?oauthError=access_denied`);
  });

  it('does not redirect to an extension whose ID was never allowlisted, even from a forged cookie', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/auth/oauth/google/callback?error=access_denied',
      headers: HEADERS,
      cookies: {
        trakwyn_oauth_state: `nonce.verifier.extension.challenge.${OTHER_EXTENSION_ID}`,
      },
    });

    expect(res.headers.location).not.toContain('chromiumapp.org');
    expect(res.headers.location).toContain('/login?oauthError=access_denied');
  });
});
