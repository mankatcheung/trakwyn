import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';
import { ENV, OAUTH_PROVIDER_MODE } from '#src/infrastructure/config/constants.js';

describe('fake OAuth consent route — OAUTH_PROVIDER_MODE=fake', () => {
  let testApp: TestApp;
  const originalMode = process.env[ENV.OAUTH_PROVIDER_MODE];

  beforeAll(async () => {
    process.env[ENV.OAUTH_PROVIDER_MODE] = OAUTH_PROVIDER_MODE.FAKE;
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    if (originalMode === undefined) delete process.env[ENV.OAUTH_PROVIDER_MODE];
    else process.env[ENV.OAUTH_PROVIDER_MODE] = originalMode;
    await testApp.cleanup();
  });

  it('redirects to the real callback with a code decoding to the requested profile', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/auth/oauth/fake-provider/authorize?provider=google&state=my-state&email=jeff%40example.com&name=Jeff',
      headers: { host: 'localhost:3001' },
    });

    expect(res.statusCode).toBe(302);
    const location = new URL(res.headers.location as string);
    expect(location.pathname).toBe('/auth/oauth/google/callback');
    expect(location.searchParams.get('state')).toBe('my-state');

    const code = location.searchParams.get('code')!;
    const profile = JSON.parse(Buffer.from(code, 'base64url').toString('utf8'));
    expect(profile).toEqual({
      providerAccountId: 'fake-google-jeff@example.com',
      email: 'jeff@example.com',
      emailVerified: true,
      name: 'Jeff',
    });
  });

  it('redirects with error=access_denied when deny=1, mirroring a real provider decline', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/auth/oauth/fake-provider/authorize?provider=github&state=my-state&deny=1',
      headers: { host: 'localhost:3001' },
    });

    expect(res.statusCode).toBe(302);
    const location = new URL(res.headers.location as string);
    expect(location.pathname).toBe('/auth/oauth/github/callback');
    expect(location.searchParams.get('error')).toBe('access_denied');
    expect(location.searchParams.get('code')).toBeNull();
  });

  it('400s when provider or state is missing', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/auth/oauth/fake-provider/authorize?provider=google',
      headers: { host: 'localhost:3001' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('404s for an unknown provider', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/auth/oauth/fake-provider/authorize?provider=facebook&state=s',
      headers: { host: 'localhost:3001' },
    });
    expect(res.statusCode).toBe(404);
  });
});
