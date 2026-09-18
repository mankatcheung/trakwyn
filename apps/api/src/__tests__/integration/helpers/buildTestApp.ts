import Fastify, { type FastifyInstance } from 'fastify';
import { vi } from 'vitest';
import { ENV } from '#src/infrastructure/config/constants.js';
import { createMigratedPglite } from '../../helpers/pgliteTemplate.js';

export interface TestApp {
  app: FastifyInstance;
  cleanup: () => Promise<void>;
}

/**
 * Builds a real, fully-wired Fastify app (`buildApp()`) against a fresh,
 * isolated in-memory PGlite database with the real migrations applied — for
 * GraphQL/HTTP integration tests driven via `app.inject()`.
 *
 * `infrastructure/db/client.ts` builds its singleton database at module
 * evaluation from `DATABASE_URL`. Here that singleton is replaced with a clone
 * of the migrated template (`helpers/pgliteTemplate.ts`) via `vi.doMock`, so
 * `buildApp`/`buildContainer` — dynamically imported afterwards — wire every
 * repository to it, exactly as they would to the production pool.
 *
 * The module registry is reset first, so every call gets its own app and its
 * own database — a file with several `describe` blocks can build (and clean
 * up) one app per block. Without the reset, the second call would reuse the
 * first call's cached modules, whose database the first cleanup has already
 * closed.
 */
export async function buildTestApp(): Promise<TestApp> {
  vi.resetModules();
  const { db, close: closeDb } = await createMigratedPglite();
  vi.doMock('#src/infrastructure/db/client.js', () => ({ db, closeDb }));
  process.env[ENV.DATABASE_URL] = 'pglite:memory';

  process.env[ENV.JWT_SECRET] ??= 'test-secret';
  process.env[ENV.JWT_REFRESH_SECRET] ??= 'test-refresh-secret';
  // Needed by any integration test that saves an LLM API key (LlmApiKeyCipher
  // throws without it) — set here rather than per-test-file so it's not a
  // surprise the next time an integration test starts touching this path.
  process.env[ENV.LLM_API_KEY_ENCRYPTION_KEY] ??= 'test-llm-api-key-encryption-key';

  const { buildApp } = await import('#src/http/buildApp.js');
  // Logger disabled — buildApp() otherwise logs every request at 'info',
  // which is just noise across dozens of requests per integration test file.
  // trustProxy mirrors index.ts's production Fastify instance (this helper
  // deliberately doesn't import index.ts itself — it has side-effecting
  // top-level fastify.listen()) — needed so tests can exercise
  // X-Forwarded-Proto-dependent behavior like oauth.routes.ts's
  // redirect_uri construction.
  const app = await buildApp(Fastify({ logger: false, trustProxy: true }));
  await app.ready();

  return {
    app,
    cleanup: async () => {
      await app.close();
      await closeDb();
    },
  };
}
