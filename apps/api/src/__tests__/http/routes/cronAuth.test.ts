import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IHttpRequest } from '#src/http/ports/IHttpRequest.js';
import { authorizeCronTrigger, isCronTriggerConfigured } from '#src/http/routes/cronAuth.js';
import { GoogleOidcTokenVerifier } from '#src/infrastructure/auth/GoogleOidcTokenVerifier.js';
import { ENV, GOOGLE_OIDC } from '#src/infrastructure/config/constants.js';
import { ADMIN_JOBS, CRON_AUTH_EVENTS } from '#src/http/constants.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import { createOidcTestKeys, type OidcTestKeys } from '../../helpers/oidcTokens.js';
import { makeLogger } from '../../helpers/mocks/infrastructure.js';

const API_ORIGIN = 'https://api.example.com';
const INVOKER = 'cron-invoker@project.iam.gserviceaccount.com';

function requestWith(authorization?: string): IHttpRequest {
  return {
    method: 'POST',
    path: '/admin/reminders/send',
    headers: authorization === undefined ? {} : { authorization },
    cookies: {},
    params: {},
    query: {},
    body: undefined,
    ip: null,
    protocol: 'https',
  };
}

describe('cronAuth', () => {
  let google: OidcTestKeys;
  let verifier: GoogleOidcTokenVerifier;
  let logger: ILogger;

  beforeAll(async () => {
    google = await createOidcTestKeys();
    verifier = new GoogleOidcTokenVerifier({ keys: google.keys });
  });

  beforeEach(() => {
    logger = makeLogger();
    vi.stubEnv(ENV.CRON_SECRET, undefined);
    vi.stubEnv(ENV.DIGEST_ADMIN_SECRET, undefined);
    vi.stubEnv(ENV.CRON_INVOKER_SA, INVOKER);
    vi.stubEnv(ENV.API_ORIGIN, API_ORIGIN);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const authorize = (authorization?: string, ownSecretEnvKey: string = ENV.CRON_SECRET) =>
    authorizeCronTrigger(requestWith(authorization), ownSecretEnvKey, verifier, {
      job: ADMIN_JOBS.REMINDERS,
      logger,
    });

  const rejectionLogged = (reason: 'missing' | 'invalid') =>
    expect(logger.warn).toHaveBeenCalledWith('Cron trigger rejected', undefined, {
      event: CRON_AUTH_EVENTS.REJECTED,
      job: ADMIN_JOBS.REMINDERS,
      reason,
    });

  describe('OIDC tokens from Cloud Scheduler', () => {
    it('accepts a valid token for the invoker service account', async () => {
      const token = await google.sign(INVOKER, API_ORIGIN);

      await expect(authorize(`Bearer ${token}`)).resolves.toBe('oidc');
    });

    it('refuses a token minted for another audience', async () => {
      const token = await google.sign(INVOKER, 'https://trakwyn-api-xyz.a.run.app');

      await expect(authorize(`Bearer ${token}`)).resolves.toBeNull();
    });

    it('refuses a token for a different service account', async () => {
      const token = await google.sign('someone-else@project.iam.gserviceaccount.com', API_ORIGIN);

      await expect(authorize(`Bearer ${token}`)).resolves.toBeNull();
    });

    it('refuses an expired token', async () => {
      const token = await google.sign(INVOKER, API_ORIGIN, {
        expiresAt: Math.floor(Date.now() / 1000) - 60,
      });

      await expect(authorize(`Bearer ${token}`)).resolves.toBeNull();
    });

    it('refuses every token when CRON_INVOKER_SA is not set', async () => {
      vi.stubEnv(ENV.CRON_INVOKER_SA, undefined);
      const token = await google.sign(INVOKER, API_ORIGIN);

      await expect(authorize(`Bearer ${token}`)).resolves.toBeNull();
    });

    it('refuses every token when API_ORIGIN, the expected audience, is not set', async () => {
      vi.stubEnv(ENV.API_ORIGIN, undefined);
      const token = await google.sign(INVOKER, API_ORIGIN);

      await expect(authorize(`Bearer ${token}`)).resolves.toBeNull();
    });
  });

  describe('shared secrets for manual triggering', () => {
    it('accepts CRON_SECRET', async () => {
      vi.stubEnv(ENV.CRON_SECRET, 'the-cron-secret');

      await expect(authorize('Bearer the-cron-secret')).resolves.toBe('secret');
    });

    it("accepts the route's own secret", async () => {
      vi.stubEnv(ENV.DIGEST_ADMIN_SECRET, 'the-digest-secret');

      await expect(authorize('Bearer the-digest-secret', ENV.DIGEST_ADMIN_SECRET)).resolves.toBe(
        'secret',
      );
    });

    it('refuses a wrong secret', async () => {
      vi.stubEnv(ENV.CRON_SECRET, 'the-cron-secret');

      await expect(authorize('Bearer wrong')).resolves.toBeNull();
    });
  });

  it('refuses a request with no bearer token', async () => {
    await expect(authorize()).resolves.toBeNull();
    await expect(authorize('Basic abc')).resolves.toBeNull();
  });

  describe('rejection logging (JEF-356)', () => {
    it('logs a request with no bearer token as missing', async () => {
      await authorize();

      rejectionLogged('missing');
    });

    it('logs a forged token as invalid, and nothing about keys', async () => {
      const impostor = await createOidcTestKeys();
      const token = await impostor.sign(INVOKER, API_ORIGIN);

      await authorize(`Bearer ${token}`);

      rejectionLogged('invalid');
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('logs a wrong shared secret as invalid without the token', async () => {
      vi.stubEnv(ENV.CRON_SECRET, 'the-cron-secret');

      await authorize('Bearer wrong-secret-value');

      rejectionLogged('invalid');
      expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain('wrong-secret-value');
    });

    it('reports an unreachable JWKS separately from the rejection it causes', async () => {
      const verifierLogger = makeLogger();
      const unreachable = new GoogleOidcTokenVerifier({
        keys: () =>
          Promise.reject(Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' })),
        logger: verifierLogger,
      });
      const token = await google.sign(INVOKER, API_ORIGIN);

      const result = await authorizeCronTrigger(
        requestWith(`Bearer ${token}`),
        ENV.CRON_SECRET,
        unreachable,
        { job: ADMIN_JOBS.REMINDERS, logger },
      );

      expect(result).toBeNull();
      expect(verifierLogger.error).toHaveBeenCalledWith(expect.any(String), expect.any(Error), {
        event: GOOGLE_OIDC.JWKS_UNAVAILABLE_EVENT,
      });
      rejectionLogged('invalid');
    });

    it('logs nothing when the caller is let in', async () => {
      const token = await google.sign(INVOKER, API_ORIGIN);

      await authorize(`Bearer ${token}`);

      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('isCronTriggerConfigured', () => {
    it('is true with only the OIDC invoker configured', () => {
      expect(isCronTriggerConfigured(ENV.CRON_SECRET)).toBe(true);
    });

    it('is true with only CRON_SECRET', () => {
      vi.stubEnv(ENV.CRON_INVOKER_SA, undefined);
      vi.stubEnv(ENV.CRON_SECRET, 'the-cron-secret');

      expect(isCronTriggerConfigured(ENV.CRON_SECRET)).toBe(true);
    });

    it("is true with only the route's own secret", () => {
      vi.stubEnv(ENV.CRON_INVOKER_SA, undefined);
      vi.stubEnv(ENV.DIGEST_ADMIN_SECRET, 'the-digest-secret');

      expect(isCronTriggerConfigured(ENV.DIGEST_ADMIN_SECRET)).toBe(true);
    });

    it('is false with nothing configured', () => {
      vi.stubEnv(ENV.CRON_INVOKER_SA, undefined);

      expect(isCronTriggerConfigured(ENV.CRON_SECRET)).toBe(false);
    });
  });
});
