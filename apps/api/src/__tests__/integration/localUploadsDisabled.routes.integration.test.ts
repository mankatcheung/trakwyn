import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';
import { ENV } from '#src/infrastructure/config/constants.js';

/**
 * A separate file, deliberately — buildApp()/infrastructure.ts read
 * STORAGE_PROVIDER when first imported, and Vitest's per-file module
 * isolation is what makes this a build with the local routes absent.
 * With STORAGE_PROVIDER unset the container still falls back to
 * LocalStorageProvider, so the only thing keeping the route away is
 * buildApp's `=== 'local'` gate — which is exactly what this checks.
 */
describe('local uploads route — absent unless STORAGE_PROVIDER=local', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    delete process.env[ENV.STORAGE_PROVIDER];
    testApp = await buildTestApp();
  }, 30_000);

  afterAll(async () => {
    await testApp.cleanup();
  });

  it('does not register GET /uploads/*', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/uploads/documents/app-1/doc-1.pdf',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ message: expect.stringContaining('Route GET') });
  });
});
