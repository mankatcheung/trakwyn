import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';
import { ENV } from '#src/infrastructure/config/constants.js';

/**
 * The full happy path for OAuth *login* (not link), driven end-to-end against
 * FakeOAuthProvider — real /start, real state/PKCE cookies, real callback —
 * so the destination the callback finally redirects to is asserted exactly.
 *
 * That destination matters since JEF-236: a plain sign-in with no captured
 * returnTo used to land on the marketing root and relied on the landing
 * page's logged-in redirect to finish the journey to the dashboard. That
 * redirect is gone, so the API itself must send users somewhere real.
 */
describe('oauth login callback destination — OAUTH_PROVIDER_MODE=fake', () => {
  let testApp: TestApp;
  const originalClientId = process.env[ENV.GOOGLE_OAUTH_CLIENT_ID];

  beforeAll(async () => {
    process.env[ENV.OAUTH_PROVIDER_MODE] = 'fake';
    // /start refuses to run unconfigured; fake mode never reads the secret,
    // but the client id gates the route itself.
    process.env[ENV.GOOGLE_OAUTH_CLIENT_ID] = 'test-google-client-id';
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    if (originalClientId === undefined) delete process.env[ENV.GOOGLE_OAUTH_CLIENT_ID];
    else process.env[ENV.GOOGLE_OAUTH_CLIENT_ID] = originalClientId;
    await testApp.cleanup();
  });

  /** Drives start -> fake consent -> callback and returns the final redirect. */
  async function oauthLogin(returnTo?: string) {
    const webAppOrigin = (
      testApp.app as unknown as { diContainer: { cradle: { webAppOrigin: string } } }
    ).diContainer.cradle.webAppOrigin;

    const query = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '';
    const start = await testApp.app.inject({
      method: 'GET',
      url: `/auth/oauth/google/start${query}`,
      headers: { host: 'localhost:3001' },
    });
    expect(start.statusCode).toBe(302);

    // Play the provider: the consent route mints the code the callback wants.
    const consent = await testApp.app.inject({
      method: 'GET',
      url: start.headers.location as string,
      headers: { host: 'localhost:3001' },
    });
    expect(consent.statusCode).toBe(302);
    const callbackUrl = new URL(consent.headers.location as string);

    const callback = await testApp.app.inject({
      method: 'GET',
      url: `${callbackUrl.pathname}${callbackUrl.search}`,
      headers: { host: 'localhost:3001' },
      cookies: (start.cookies as Array<{ name: string; value: string }>).reduce(
        (jar, cookie) => ({ ...jar, [cookie.name]: cookie.value }),
        {} as Record<string, string>,
      ),
    });

    expect(callback.statusCode).toBe(302);
    return { location: new URL(callback.headers.location as string), webAppOrigin };
  }

  it('lands a plain sign-in on the dashboard, not the marketing root', async () => {
    const { location, webAppOrigin } = await oauthLogin();

    expect(`${location.origin}${location.pathname}`).toBe(`${webAppOrigin}/dashboard`);
  });

  it('still honours an explicit returnTo over the dashboard default', async () => {
    const { location, webAppOrigin } = await oauthLogin('/applications?status=applied');

    expect(location.origin).toBe(webAppOrigin);
    expect(location.pathname).toBe('/applications');
    expect(location.searchParams.get('status')).toBe('applied');
  });
});
