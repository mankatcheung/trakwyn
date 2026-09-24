import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENV } from '#src/infrastructure/config/constants.js';
import { ROUTES } from '#src/http/constants.js';
import { createOidcTestKeys, type OidcTestKeys } from '../helpers/oidcTokens.js';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';

const API_ORIGIN = 'https://api.example.com';
const INVOKER = 'cron-invoker@project.iam.gserviceaccount.com';

/**
 * The three routes Cloud Scheduler drives, authenticated the way it does in
 * production (JEF-336): a Google-signed OIDC ID token, no shared secret.
 * The verifier is the real one, pointed at a local key set instead of
 * Google's JWKS.
 */
const SCHEDULED_ROUTES = [ROUTES.DIGEST_SEND, ROUTES.REMINDERS_SEND, ROUTES.TRASH_PURGE];

describe('admin cron routes with Cloud Scheduler OIDC tokens', () => {
  let google: OidcTestKeys;
  let testApp: TestApp;

  beforeAll(async () => {
    google = await createOidcTestKeys();
    const keys = google.keys;
    vi.doMock('#src/infrastructure/auth/GoogleOidcTokenVerifier.js', async (importOriginal) => {
      const actual =
        await importOriginal<
          typeof import('#src/infrastructure/auth/GoogleOidcTokenVerifier.js')
        >();
      return {
        GoogleOidcTokenVerifier: class extends actual.GoogleOidcTokenVerifier {
          constructor() {
            super({ keys });
          }
        },
      };
    });
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.cleanup();
    vi.doUnmock('#src/infrastructure/auth/GoogleOidcTokenVerifier.js');
  });

  beforeEach(() => {
    // Only the OIDC path is configured, as in production after JEF-336.
    vi.stubEnv(ENV.CRON_SECRET, undefined);
    vi.stubEnv(ENV.DIGEST_ADMIN_SECRET, undefined);
    vi.stubEnv(ENV.CRON_INVOKER_SA, INVOKER);
    vi.stubEnv(ENV.API_ORIGIN, API_ORIGIN);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe.each(SCHEDULED_ROUTES)('%s', (url) => {
    it('runs for a valid token from the invoker service account', async () => {
      const token = await google.sign(INVOKER, API_ORIGIN);

      const res = await testApp.app.inject({
        method: 'POST',
        url,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(expect.objectContaining({ ok: true }));
    });

    it('returns 401 without a token', async () => {
      const res = await testApp.app.inject({ method: 'POST', url });

      expect(res.statusCode).toBe(401);
    });

    it('returns 401 for a token with the wrong audience', async () => {
      const token = await google.sign(INVOKER, 'https://elsewhere.example.com');

      const res = await testApp.app.inject({
        method: 'POST',
        url,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(401);
    });

    it('returns 401 for a token from another service account', async () => {
      const token = await google.sign('intruder@project.iam.gserviceaccount.com', API_ORIGIN);

      const res = await testApp.app.inject({
        method: 'POST',
        url,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(401);
    });

    it('returns 401 for an expired token', async () => {
      const token = await google.sign(INVOKER, API_ORIGIN, {
        expiresAt: Math.floor(Date.now() / 1000) - 60,
      });

      const res = await testApp.app.inject({
        method: 'POST',
        url,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(401);
    });

    it('returns 503 when neither OIDC nor a secret is configured', async () => {
      vi.stubEnv(ENV.CRON_INVOKER_SA, undefined);

      const res = await testApp.app.inject({ method: 'POST', url });

      expect(res.statusCode).toBe(503);
    });
  });
});
