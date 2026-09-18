import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';
import { ENV } from '#src/infrastructure/config/constants.js';

/**
 * A separate file, deliberately — see the identical note in
 * fakeOAuthConsentDisabled.routes.integration.test.ts: buildApp.ts reads
 * LLM_PROVIDER_MODE into a module-level constant on first import, so this
 * needs its own file for Vitest's per-file module isolation to make "default
 * mode" a real, independent build rather than reusing a cached fake-mode one.
 */
describe('fake LLM completions route — absent unless LLM_PROVIDER_MODE=fake', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    delete process.env[ENV.LLM_PROVIDER_MODE];
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  it('does not exist in the default (real) mode any real deployment runs in', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/llm-test/fake/chat/completions',
      payload: { model: 'x', messages: [] },
    });
    expect(res.statusCode).toBe(404);
  });
});
