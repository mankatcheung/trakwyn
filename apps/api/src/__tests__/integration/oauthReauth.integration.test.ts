import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';
import { ENV } from '#src/infrastructure/config/constants.js';

/**
 * OAuth step-up (JEF-463), end to end against FakeOAuthProvider: a signed-in
 * Google user mints a ticket, signs in again at the "provider", and comes back
 * to the page it started from with its own session re-signed with a fresh
 * `authTime`. A sign-in to some other Google account must not count.
 */
describe('oauth step-up — OAUTH_PROVIDER_MODE=fake', () => {
  let testApp: TestApp;
  let webAppOrigin: string;
  const originalClientIds = {
    google: process.env[ENV.GOOGLE_OAUTH_CLIENT_ID],
    github: process.env[ENV.GITHUB_OAUTH_CLIENT_ID],
  };
  const host = { host: 'localhost:3001' };

  beforeAll(async () => {
    process.env[ENV.OAUTH_PROVIDER_MODE] = 'fake';
    process.env[ENV.GOOGLE_OAUTH_CLIENT_ID] = 'test-google-client-id';
    process.env[ENV.GITHUB_OAUTH_CLIENT_ID] = 'test-github-client-id';
    testApp = await buildTestApp();
    webAppOrigin = (testApp.app as unknown as { diContainer: { cradle: { webAppOrigin: string } } })
      .diContainer.cradle.webAppOrigin;
  });

  afterAll(async () => {
    for (const [name, value] of [
      [ENV.GOOGLE_OAUTH_CLIENT_ID, originalClientIds.google],
      [ENV.GITHUB_OAUTH_CLIENT_ID, originalClientIds.github],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await testApp.cleanup();
  });

  type Cookie = { name: string; value: string };
  const jar = (cookies: Cookie[]): Record<string, string> =>
    Object.fromEntries(cookies.map((c) => [c.name, c.value]));
  const authTimeOf = (accessToken: string): number =>
    (
      JSON.parse(Buffer.from(accessToken.split('.')[1]!, 'base64url').toString()) as {
        authTime: number;
      }
    ).authTime;

  /** start -> fake consent (as `email`) -> callback. */
  async function runFlow(provider: string, startQuery: string, email: string) {
    const start = await testApp.app.inject({
      method: 'GET',
      url: `/auth/oauth/${provider}/start${startQuery}`,
      headers: host,
    });
    if (start.statusCode !== 302) return { start, callback: undefined };
    const consent = await testApp.app.inject({
      method: 'GET',
      url: `${start.headers.location as string}&email=${encodeURIComponent(email)}`,
      headers: host,
    });
    const callbackUrl = new URL(consent.headers.location as string);
    const callback = await testApp.app.inject({
      method: 'GET',
      url: `${callbackUrl.pathname}${callbackUrl.search}`,
      headers: host,
      cookies: jar(start.cookies as Cookie[]),
    });
    return { start, callback };
  }

  async function signIn(email: string): Promise<string> {
    const { callback } = await runFlow('google', '', email);
    return (callback!.cookies as Cookie[]).find((c) => c.name === 'trakwyn_access_token')!.value;
  }

  async function startTicket(accessToken: string, provider = 'google') {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      cookies: { trakwyn_access_token: accessToken },
      payload: {
        query: `mutation($p: OAuthProvider!) { startOAuthReauth(provider: $p) }`,
        variables: { p: provider },
      },
    });
    return res.json() as {
      data?: { startOAuthReauth: string };
      errors?: Array<{ extensions?: { code?: string } }>;
    };
  }

  const reauthQuery = (ticket: string, returnTo = '/settings/danger-zone') =>
    `?mode=reauth&ticket=${encodeURIComponent(ticket)}&returnTo=${encodeURIComponent(returnTo)}`;

  it('re-signs the same session with a fresh authTime and returns to the page', async () => {
    const accessToken = await signIn('reauth-ok@example.com');
    const ticket = (await startTicket(accessToken)).data!.startOAuthReauth;
    // authTime is in milliseconds; make sure "fresh" is measurably later.
    await new Promise((resolve) => setTimeout(resolve, 5));

    const { callback } = await runFlow('google', reauthQuery(ticket), 'reauth-ok@example.com');

    expect(callback!.statusCode).toBe(302);
    const location = new URL(callback!.headers.location as string);
    expect(`${location.origin}${location.pathname}`).toBe(`${webAppOrigin}/settings/danger-zone`);
    expect(location.searchParams.get('stepUp')).toBe('1');
    const refreshed = (callback!.cookies as Cookie[]).find(
      (c) => c.name === 'trakwyn_access_token',
    );
    expect(refreshed).toBeDefined();
    expect(authTimeOf(refreshed!.value)).toBeGreaterThan(authTimeOf(accessToken));
    const sid = (token: string) =>
      (JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as { sid: string })
        .sid;
    expect(sid(refreshed!.value)).toBe(sid(accessToken));
  });

  it('refuses a fresh sign-in to a different Google account', async () => {
    const accessToken = await signIn('reauth-owner@example.com');
    const ticket = (await startTicket(accessToken)).data!.startOAuthReauth;

    const { callback } = await runFlow('google', reauthQuery(ticket), 'someone-else@example.com');

    const location = new URL(callback!.headers.location as string);
    expect(location.searchParams.get('stepUpError')).toBe('reauth_failed');
    expect((callback!.cookies as Cookie[]).map((c) => c.name)).not.toContain(
      'trakwyn_access_token',
    );
  });

  it('refuses the start route without a valid ticket', async () => {
    const { start } = await runFlow('google', '?mode=reauth&ticket=forged.ticket', 'x@example.com');

    expect(start.statusCode).toBe(401);
  });

  it('refuses a ticket for GitHub, which cannot prove a fresh sign-in', async () => {
    const accessToken = await signIn('reauth-github@example.com');

    const result = await startTicket(accessToken, 'github');

    expect(result.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
  });
});
