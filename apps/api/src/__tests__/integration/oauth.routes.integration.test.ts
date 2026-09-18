import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';
import { ENV } from '#src/infrastructure/config/constants.js';
import { createHash } from 'crypto';
import { createPkcePair } from '#src/infrastructure/auth/pkce.js';

describe('oauth routes — redirect_uri behind Vercel-style reverse proxy', () => {
  let testApp: TestApp;
  const originalClientId = process.env[ENV.GITHUB_OAUTH_CLIENT_ID];

  beforeAll(async () => {
    testApp = await buildTestApp();
    // GitHubOAuthProvider only reads this at construction (first resolve
    // from the DI container) — set before the first request that touches
    // an oauth route in this file.
    process.env[ENV.GITHUB_OAUTH_CLIENT_ID] = 'test-github-client-id';
  });

  afterAll(async () => {
    if (originalClientId === undefined) delete process.env[ENV.GITHUB_OAUTH_CLIENT_ID];
    else process.env[ENV.GITHUB_OAUTH_CLIENT_ID] = originalClientId;
    await testApp.cleanup();
  });

  it('builds an https:// redirect_uri from X-Forwarded-Proto, not the (always-http) raw socket', async () => {
    // No TLS involved in this in-process inject() call at all — this is
    // exactly the situation index.ts is actually in on Vercel: the real
    // request was HTTPS, but Node's own connection to the function isn't,
    // so only trustProxy + this header tell Fastify the truth.
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/auth/oauth/github/start',
      headers: {
        host: 'api.trakwyn.com',
        'x-forwarded-proto': 'https',
      },
    });

    expect(res.statusCode).toBe(302);
    const location = new URL(res.headers.location as string);
    expect(location.searchParams.get('redirect_uri')).toBe(
      'https://api.trakwyn.com/auth/oauth/github/callback',
    );
  });

  it('falls back to http:// when there is no X-Forwarded-Proto, matching a direct (non-proxied) connection', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/auth/oauth/github/start',
      headers: { host: 'api.trakwyn.com' },
    });

    expect(res.statusCode).toBe(302);
    const location = new URL(res.headers.location as string);
    expect(location.searchParams.get('redirect_uri')).toBe(
      'http://api.trakwyn.com/auth/oauth/github/callback',
    );
  });
});

describe('oauth routes — state is bound to the browser that started the flow', () => {
  let testApp: TestApp;
  const originalClientId = process.env[ENV.GITHUB_OAUTH_CLIENT_ID];

  beforeAll(async () => {
    testApp = await buildTestApp();
    process.env[ENV.GITHUB_OAUTH_CLIENT_ID] = 'test-github-client-id';
  });

  afterAll(async () => {
    if (originalClientId === undefined) delete process.env[ENV.GITHUB_OAUTH_CLIENT_ID];
    else process.env[ENV.GITHUB_OAUTH_CLIENT_ID] = originalClientId;
    await testApp.cleanup();
  });

  /** Runs /start and returns the state the provider would echo back, plus the cookie set alongside it. */
  async function beginFlow(): Promise<{ state: string; stateCookie: string | undefined }> {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/auth/oauth/github/start',
      headers: { host: 'api.trakwyn.com', 'x-forwarded-proto': 'https' },
    });
    const state = new URL(res.headers.location as string).searchParams.get('state')!;
    const cookies = res.cookies as Array<{ name: string; value: string }>;
    return { state, stateCookie: cookies.find((c) => c.name === 'trakwyn_oauth_state')?.value };
  }

  const callback = (state: string, cookies?: Record<string, string>) =>
    testApp.app.inject({
      method: 'GET',
      url: `/auth/oauth/github/callback?code=some-code&state=${encodeURIComponent(state)}`,
      headers: { host: 'api.trakwyn.com', 'x-forwarded-proto': 'https' },
      ...(cookies ? { cookies } : {}),
    });

  it('sets a state cookie when the flow begins', async () => {
    const { stateCookie } = await beginFlow();

    expect(stateCookie).toBeTruthy();
  });

  it('refuses a valid, correctly-signed state presented by a browser that never started the flow', async () => {
    // The attack: an attacker runs the flow themselves, keeps their own valid
    // code + state, and hands the victim the callback URL. The signature
    // verifies — it really is one of ours — but the victim's browser has no
    // matching cookie, so it cannot be the browser this was issued to.
    const { state } = await beginFlow();

    const res = await callback(state);

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('oauthError=invalid_state');
    // Above all: no session may be handed to the victim.
    const names = (res.cookies as Array<{ name: string; value: string }>)
      .filter((c) => c.value !== '')
      .map((c) => c.name);
    expect(names).not.toContain('trakwyn_access_token');
    expect(names).not.toContain('trakwyn_refresh_token');
  });

  it('refuses a state whose nonce does not match the cookie', async () => {
    const { state } = await beginFlow();
    const other = await beginFlow();

    // Both are real states from real flows — but crossed over.
    const res = await callback(state, { trakwyn_oauth_state: other.stateCookie! });

    expect(res.headers.location).toContain('oauthError=invalid_state');
  });

  it('gets past the binding check when the cookie matches, and fails later on the code instead', async () => {
    const { state, stateCookie } = await beginFlow();

    const res = await callback(state, { trakwyn_oauth_state: stateCookie! });

    // The token exchange is what fails now (there is no real GitHub here),
    // which is proof the binding check itself passed.
    expect(res.headers.location).toContain('oauthError=');
    expect(res.headers.location).not.toContain('oauthError=invalid_state');
  });

  it('clears the state cookie on the way out, so a stale nonce cannot block the next attempt', async () => {
    const { state, stateCookie } = await beginFlow();

    const res = await callback(state, { trakwyn_oauth_state: stateCookie! });

    const cleared = (res.cookies as Array<{ name: string; value: string }>).find(
      (c) => c.name === 'trakwyn_oauth_state',
    );
    expect(cleared?.value).toBe('');
  });

  it('clears the state cookie even when the provider reports an error', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/auth/oauth/github/callback?error=access_denied',
      headers: { host: 'api.trakwyn.com', 'x-forwarded-proto': 'https' },
      cookies: { trakwyn_oauth_state: 'whatever' },
    });

    const cleared = (res.cookies as Array<{ name: string; value: string }>).find(
      (c) => c.name === 'trakwyn_oauth_state',
    );
    expect(cleared?.value).toBe('');
  });
});

describe('oauth routes — PKCE', () => {
  let testApp: TestApp;
  const originalClientId = process.env[ENV.GITHUB_OAUTH_CLIENT_ID];

  beforeAll(async () => {
    testApp = await buildTestApp();
    process.env[ENV.GITHUB_OAUTH_CLIENT_ID] = 'test-github-client-id';
  });

  afterAll(async () => {
    if (originalClientId === undefined) delete process.env[ENV.GITHUB_OAUTH_CLIENT_ID];
    else process.env[ENV.GITHUB_OAUTH_CLIENT_ID] = originalClientId;
    await testApp.cleanup();
  });

  async function beginFlow() {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/auth/oauth/github/start',
      headers: { host: 'api.trakwyn.com', 'x-forwarded-proto': 'https' },
    });
    const location = new URL(res.headers.location as string);
    const cookie = (res.cookies as Array<{ name: string; value: string }>).find(
      (c) => c.name === 'trakwyn_oauth_state',
    )!.value;
    const [nonce, verifier] = cookie.split('.');
    return { location, cookie, nonce, verifier };
  }

  it('sends a challenge and names S256 as the method', async () => {
    const { location } = await beginFlow();

    expect(location.searchParams.get('code_challenge')).toBeTruthy();
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('sends the SHA-256 of the verifier it kept, not an unrelated value', async () => {
    // The assertion that matters. "A challenge is present" would pass against
    // an implementation sending a random string — which would protect nothing,
    // because the exchange would then never match.
    const { location, verifier } = await beginFlow();

    expect(location.searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(verifier).digest('base64url'),
    );
  });

  it('keeps the verifier out of the browser-visible half of the handshake', async () => {
    const { location, verifier } = await beginFlow();

    // The verifier must never appear in the URL the user is redirected to —
    // that is the entire point of hashing it.
    expect(location.toString()).not.toContain(verifier);
    expect(location.searchParams.get('state')).not.toContain(verifier);
  });

  it('refuses a callback whose cookie carries no verifier', async () => {
    const { nonce } = await beginFlow();
    const stateRes = await testApp.app.inject({
      method: 'GET',
      url: '/auth/oauth/github/start',
      headers: { host: 'api.trakwyn.com', 'x-forwarded-proto': 'https' },
    });
    const state = new URL(stateRes.headers.location as string).searchParams.get('state')!;
    const realNonce = (stateRes.cookies as Array<{ name: string; value: string }>)
      .find((c) => c.name === 'trakwyn_oauth_state')!
      .value.split('.')[0];
    void nonce;

    // A cookie holding only the nonce — as an older client, or a tampering
    // attempt, might present. Falling back to an exchange without PKCE would
    // leave the property unenforced while looking enforced.
    const res = await testApp.app.inject({
      method: 'GET',
      url: `/auth/oauth/github/callback?code=some-code&state=${encodeURIComponent(state)}`,
      headers: { host: 'api.trakwyn.com', 'x-forwarded-proto': 'https' },
      cookies: { trakwyn_oauth_state: realNonce },
    });

    expect(res.headers.location).toContain('oauthError=invalid_state');
  });
});

describe('oauth routes — mobile platform (JEF-275)', () => {
  let testApp: TestApp;
  const originalClientId = process.env[ENV.GITHUB_OAUTH_CLIENT_ID];

  beforeAll(async () => {
    testApp = await buildTestApp();
    process.env[ENV.GITHUB_OAUTH_CLIENT_ID] = 'test-github-client-id';
  });

  afterAll(async () => {
    if (originalClientId === undefined) delete process.env[ENV.GITHUB_OAUTH_CLIENT_ID];
    else process.env[ENV.GITHUB_OAUTH_CLIENT_ID] = originalClientId;
    await testApp.cleanup();
  });

  async function beginMobileFlow(
    codeChallenge = createPkcePair().challenge,
  ): Promise<{ state: string; stateCookie: string | undefined }> {
    const res = await testApp.app.inject({
      method: 'GET',
      url: `/auth/oauth/github/start?platform=mobile&codeChallenge=${encodeURIComponent(codeChallenge)}`,
      headers: { host: 'api.trakwyn.com', 'x-forwarded-proto': 'https' },
    });
    const state = new URL(res.headers.location as string).searchParams.get('state')!;
    const cookies = res.cookies as Array<{ name: string; value: string }>;
    return { state, stateCookie: cookies.find((c) => c.name === 'trakwyn_oauth_state')?.value };
  }

  it('carries the mobile platform in the redirect cookie', async () => {
    const { stateCookie } = await beginMobileFlow();

    expect(stateCookie?.split('.')[2]).toBe('mobile');
  });

  it('carries the mobile PKCE code_challenge in the redirect cookie', async () => {
    const { challenge } = createPkcePair();

    const { stateCookie } = await beginMobileFlow(challenge);

    expect(stateCookie?.split('.')[3]).toBe(challenge);
  });

  it('refuses to start a mobile flow with no codeChallenge', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/auth/oauth/github/start?platform=mobile',
      headers: { host: 'api.trakwyn.com', 'x-forwarded-proto': 'https' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('refuses to start a mobile flow with a malformed codeChallenge', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/auth/oauth/github/start?platform=mobile&codeChallenge=too-short',
      headers: { host: 'api.trakwyn.com', 'x-forwarded-proto': 'https' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('does not require a codeChallenge for a web flow', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/auth/oauth/github/start',
      headers: { host: 'api.trakwyn.com', 'x-forwarded-proto': 'https' },
    });

    expect(res.statusCode).toBe(302);
  });

  it('sends a mobile flow that fails before state is verified to the app deep link, not the web login page', async () => {
    const { stateCookie } = await beginMobileFlow();

    const res = await testApp.app.inject({
      method: 'GET',
      url: '/auth/oauth/github/callback?error=access_denied',
      headers: { host: 'api.trakwyn.com', 'x-forwarded-proto': 'https' },
      cookies: { trakwyn_oauth_state: stateCookie! },
    });

    expect(res.headers.location).toMatch(/^trakwyn:\/\/oauth-callback\?oauthError=access_denied$/);
  });

  it('sends a mobile flow that fails the token exchange to the app deep link with an error code', async () => {
    const { state, stateCookie } = await beginMobileFlow();

    const res = await testApp.app.inject({
      method: 'GET',
      url: `/auth/oauth/github/callback?code=some-code&state=${encodeURIComponent(state)}`,
      headers: { host: 'api.trakwyn.com', 'x-forwarded-proto': 'https' },
      cookies: { trakwyn_oauth_state: stateCookie! },
    });

    // No real GitHub here, so the token exchange fails — the point is *where*
    // the failure lands, not that it succeeds.
    expect(res.headers.location).toMatch(/^trakwyn:\/\/oauth-callback\?oauthError=/);
    const names = (res.cookies as Array<{ name: string; value: string }>)
      .filter((c) => c.value !== '')
      .map((c) => c.name);
    expect(names).not.toContain('trakwyn_access_token');
    expect(names).not.toContain('trakwyn_refresh_token');
  });

  it('a web flow is unaffected — still lands on the web login page', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/auth/oauth/github/callback?error=access_denied',
      headers: { host: 'api.trakwyn.com', 'x-forwarded-proto': 'https' },
    });

    expect(res.headers.location).toContain('/login?oauthError=access_denied');
    expect(res.headers.location).not.toContain('trakwyn://');
  });
});

describe('oauth routes — the callback never leaks internal error detail', () => {
  let testApp: TestApp;
  const originalClientId = process.env[ENV.GITHUB_OAUTH_CLIENT_ID];

  beforeAll(async () => {
    testApp = await buildTestApp();
    process.env[ENV.GITHUB_OAUTH_CLIENT_ID] = 'test-github-client-id';
  });

  afterAll(async () => {
    if (originalClientId === undefined) delete process.env[ENV.GITHUB_OAUTH_CLIENT_ID];
    else process.env[ENV.GITHUB_OAUTH_CLIENT_ID] = originalClientId;
    await testApp.cleanup();
  });

  async function callbackAfterRealStart() {
    const start = await testApp.app.inject({
      method: 'GET',
      url: '/auth/oauth/github/start',
      headers: { host: 'api.trakwyn.com', 'x-forwarded-proto': 'https' },
    });
    const state = new URL(start.headers.location as string).searchParams.get('state')!;
    const cookie = (start.cookies as Array<{ name: string; value: string }>).find(
      (c) => c.name === 'trakwyn_oauth_state',
    )!.value;

    return testApp.app.inject({
      method: 'GET',
      url: `/auth/oauth/github/callback?code=some-code&state=${encodeURIComponent(state)}`,
      headers: { host: 'api.trakwyn.com', 'x-forwarded-proto': 'https' },
      cookies: { trakwyn_oauth_state: cookie },
    });
  }

  it('does not put the thrown message in the redirect URL', async () => {
    // Reaches the real GitHub token exchange, which fails here and throws
    // `GitHub token exchange failed: <status>`. That string, and anything like
    // it, must not reach the user's URL bar, history, or Referer.
    const res = await callbackAfterRealStart();
    const location = res.headers.location as string;

    expect(location).toContain('oauthError=');
    expect(location).not.toMatch(/token exchange failed/i);
    expect(location).not.toMatch(/GITHUB_OAUTH_CLIENT/);
    expect(location).not.toMatch(/CLIENT_SECRET/);
  });

  it('reports a stable slug the client can translate', async () => {
    const res = await callbackAfterRealStart();

    expect(new URL(res.headers.location as string).searchParams.get('oauthError')).toBe('failed');
  });

  it('passes a provider access_denied through as its own slug', async () => {
    // "The user pressed Cancel" is a distinct outcome and deserves its own copy.
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/auth/oauth/github/callback?error=access_denied',
      headers: { host: 'api.trakwyn.com', 'x-forwarded-proto': 'https' },
    });

    expect(new URL(res.headers.location as string).searchParams.get('oauthError')).toBe(
      'access_denied',
    );
  });

  it('does not echo an arbitrary provider error string into the page', async () => {
    // Attacker-influencable text: allow-listed, not forwarded.
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/auth/oauth/github/callback?error=' + encodeURIComponent('something <script> odd'),
      headers: { host: 'api.trakwyn.com', 'x-forwarded-proto': 'https' },
    });
    const location = res.headers.location as string;

    expect(new URL(location).searchParams.get('oauthError')).toBe('failed');
    expect(location).not.toContain('script');
  });
  it('logs the real error server-side, so the detail is hidden rather than lost', async () => {
    const { logger } = (
      testApp.app as unknown as { diContainer: { cradle: { logger: { error: unknown } } } }
    ).diContainer.cradle;
    const spy = vi.spyOn(logger as { error: (m: string, e: unknown) => void }, 'error');

    await callbackAfterRealStart();

    expect(spy).toHaveBeenCalled();
    const [message, err] = spy.mock.calls[spy.mock.calls.length - 1]!;
    expect(String(message)).toContain('OAuth login failed');
    // The real message names this deployment's own environment variables.
    // Before JEF-203 that string went into the user's URL bar and onto the
    // sign-in page; now it reaches the log and nowhere else.
    expect(String((err as Error).message)).toContain('GITHUB_OAUTH_CLIENT_SECRET');
    spy.mockRestore();
  });
});
