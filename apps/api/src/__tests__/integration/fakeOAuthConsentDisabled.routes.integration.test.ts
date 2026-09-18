import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';
import { ENV } from '#src/infrastructure/config/constants.js';

/**
 * A separate file, deliberately — buildApp()/infrastructure.ts read
 * OAUTH_PROVIDER_MODE into a module-level constant on first import, so a
 * second buildTestApp() call within a file already exercising fake mode
 * (fakeOAuthConsent.routes.integration.test.ts) would reuse that cached
 * value regardless of what this test then sets. Vitest's per-file module
 * isolation is what makes "default mode" a real, independent build here.
 */
describe('fake OAuth consent route — absent unless OAUTH_PROVIDER_MODE=fake', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    delete process.env[ENV.OAUTH_PROVIDER_MODE];
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  it('does not exist in the default (real) mode any real deployment runs in', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/auth/oauth/fake-provider/authorize?provider=google&state=s',
      headers: { host: 'localhost:3001' },
    });
    expect(res.statusCode).toBe(404);
  });
});
