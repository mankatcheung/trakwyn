import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cradle } from '#src/http/container.js';
import type { IHttpRequest } from '#src/http/ports/IHttpRequest.js';
import type { IHttpResponse } from '#src/http/ports/IHttpResponse.js';
import type { RouteDefinition } from '#src/http/ports/RouteDefinition.js';
import { ADMIN_JOBS, ROUTES } from '#src/http/constants.js';
import { digestRoutes } from '#src/http/routes/digest.routes.js';
import { pushNotificationsRoutes } from '#src/http/routes/pushNotifications.routes.js';
import { remindersRoutes } from '#src/http/routes/reminders.routes.js';
import { trashPurgeRoutes } from '#src/http/routes/trashPurge.routes.js';
import { ENV } from '#src/infrastructure/config/constants.js';
import { makeLogger } from '#src/__tests__/helpers/mocks/infrastructure.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';

/**
 * The four `/admin/*` jobs each report one summary line per run (JEF-352).
 * `runScheduledJob.test.ts` covers the line's shape; what is checked here is
 * the wiring only these files know — which job name each route reports, and
 * which of its use case's counts it calls `processed`.
 */

const SECRET = 'the-cron-secret';
const INVOKER = 'cron-invoker@project.iam.gserviceaccount.com';
const API_ORIGIN = 'https://api.example.com';

interface Fake {
  logger: ILogger;
  sent: unknown;
  status: number;
}

function makeResponse(state: Fake): IHttpResponse {
  const res: IHttpResponse = {
    status: (code) => {
      state.status = code;
      return res;
    },
    header: () => res,
    send: (body) => {
      state.sent = body;
    },
    redirect: () => undefined,
    setCookie: () => undefined,
    clearCookie: () => undefined,
  };
  return res;
}

function request(authorization = `Bearer ${SECRET}`): IHttpRequest {
  return {
    method: 'POST',
    path: '/admin',
    headers: { authorization },
    cookies: {},
    params: {},
    query: {},
    body: undefined,
    ip: null,
    protocol: 'https',
  };
}

/**
 * The OIDC path is exercised through the verifier port rather than a signed
 * token — `cronAuth.test.ts` owns real token verification; what matters here
 * is that whichever path admitted the caller reaches the log line.
 */
const oidcVerifier = { verify: vi.fn().mockResolvedValue({ email: INVOKER }) };
const noOidcVerifier = { verify: vi.fn().mockResolvedValue(null) };

function runRoute(
  routes: RouteDefinition[],
  cradle: Partial<Cradle>,
  req: IHttpRequest = request(),
): Promise<Fake> {
  const state: Fake = { logger: cradle.logger as ILogger, sent: undefined, status: 200 };
  const handler = routes[0]!.handler;
  return Promise.resolve(handler(req, makeResponse(state))).then(() => state);
}

const cradleWith = (extra: Record<string, unknown>, logger = makeLogger()): Partial<Cradle> =>
  ({
    logger,
    oidcTokenVerifier: noOidcVerifier,
    ...extra,
  }) as unknown as Partial<Cradle>;

const getCradle = (cradle: Partial<Cradle>) => () => cradle as Cradle;

describe('admin job routes', () => {
  beforeEach(() => {
    vi.stubEnv(ENV.CRON_SECRET, SECRET);
    vi.stubEnv(ENV.DIGEST_ADMIN_SECRET, undefined);
    vi.stubEnv(ENV.CRON_INVOKER_SA, undefined);
    vi.stubEnv(ENV.API_ORIGIN, undefined);
    vi.stubEnv(ENV.VAPID_PUBLIC_KEY, 'a-public-key');
    vi.stubEnv(ENV.VAPID_PRIVATE_KEY, 'a-private-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  describe('trash purge', () => {
    it('reports the applications purged as processed', async () => {
      const cradle = cradleWith({
        purgeExpiredApplicationsUseCase: {
          execute: vi.fn().mockResolvedValue({ purged: 4, failed: 1 }),
        },
      });

      const state = await runRoute(trashPurgeRoutes(getCradle(cradle)), cradle);

      expect(state.logger.info).toHaveBeenCalledTimes(1);
      expect(state.logger.info).toHaveBeenCalledWith(
        'job.trash_purge.completed',
        expect.objectContaining({ job: ADMIN_JOBS.TRASH_PURGE, processed: 4, failed: 1 }),
      );
      expect(state.sent).toEqual({ ok: false, purged: 4, failed: 1 });
    });

    it('logs the failed line and answers 500 when the run throws', async () => {
      const error = new Error('purge exploded');
      const cradle = cradleWith({
        purgeExpiredApplicationsUseCase: { execute: vi.fn().mockRejectedValue(error) },
      });

      const state = await runRoute(trashPurgeRoutes(getCradle(cradle)), cradle);

      expect(state.logger.info).not.toHaveBeenCalled();
      expect(state.logger.error).toHaveBeenCalledWith(
        expect.stringContaining('trash_purge'),
        error,
        expect.objectContaining({ event: 'job.trash_purge.failed' }),
      );
      expect(state.status).toBe(500);
    });
  });

  describe('digest', () => {
    it('reports the digests sent as processed', async () => {
      const cradle = cradleWith({
        sendWeeklyDigestUseCase: {
          execute: vi.fn().mockResolvedValue({ totalUsers: 9, sent: 3, skipped: 6, failed: 0 }),
        },
      });

      const state = await runRoute(digestRoutes(getCradle(cradle)), cradle);

      expect(state.logger.info).toHaveBeenCalledWith(
        'job.digest.completed',
        expect.objectContaining({ job: ADMIN_JOBS.DIGEST, processed: 3, failed: 0 }),
      );
    });
  });

  describe('reminders', () => {
    it('reports the reminders sent as processed', async () => {
      const cradle = cradleWith({
        sendFollowUpRemindersUseCase: {
          execute: vi.fn().mockResolvedValue({ sent: 2, failed: 0, skipped: 1 }),
        },
      });

      const state = await runRoute(remindersRoutes(getCradle(cradle)), cradle);

      expect(state.logger.info).toHaveBeenCalledWith(
        'job.reminders.completed',
        expect.objectContaining({ job: ADMIN_JOBS.REMINDERS, processed: 2, failed: 0 }),
      );
      expect(state.sent).toEqual({ ok: true, sent: 2, failed: 0, skipped: 1 });
    });
  });

  describe('push notifications', () => {
    it('reports the notifications delivered as processed', async () => {
      const cradle = cradleWith({
        sendPushNotificationsUseCase: {
          execute: vi.fn().mockResolvedValue({ delivered: 5, failed: 2 }),
        },
      });

      const state = await runRoute(pushNotificationsRoutes(getCradle(cradle)), cradle);

      expect(state.logger.info).toHaveBeenCalledWith(
        'job.push_notifications.completed',
        expect.objectContaining({ job: ADMIN_JOBS.PUSH_NOTIFICATIONS, processed: 5, failed: 2 }),
      );
    });

    it('warns that the VAPID keys are missing rather than answering 503 in silence', async () => {
      vi.stubEnv(ENV.VAPID_PRIVATE_KEY, undefined);
      const cradle = cradleWith({ sendPushNotificationsUseCase: { execute: vi.fn() } });

      const state = await runRoute(pushNotificationsRoutes(getCradle(cradle)), cradle);

      expect(state.status).toBe(503);
      expect(state.logger.warn).toHaveBeenCalledWith('job.push_notifications.misconfigured', {
        job: ADMIN_JOBS.PUSH_NOTIFICATIONS,
        reason: 'vapid_keys_missing',
      });
    });
  });

  describe('the auth path that admitted the caller', () => {
    it('is reported as `secret` for a shared-secret trigger', async () => {
      const cradle = cradleWith({
        sendFollowUpRemindersUseCase: {
          execute: vi.fn().mockResolvedValue({ sent: 0, failed: 0, skipped: 0 }),
        },
      });

      const state = await runRoute(remindersRoutes(getCradle(cradle)), cradle);

      expect(state.logger.info).toHaveBeenCalledWith(
        'job.reminders.completed',
        expect.objectContaining({ auth: 'secret' }),
      );
    });

    it('is reported as `oidc` for a verified Cloud Scheduler token', async () => {
      vi.stubEnv(ENV.CRON_SECRET, undefined);
      vi.stubEnv(ENV.CRON_INVOKER_SA, INVOKER);
      vi.stubEnv(ENV.API_ORIGIN, API_ORIGIN);
      const cradle = cradleWith({
        oidcTokenVerifier: oidcVerifier,
        sendFollowUpRemindersUseCase: {
          execute: vi.fn().mockResolvedValue({ sent: 0, failed: 0, skipped: 0 }),
        },
      });

      const state = await runRoute(
        remindersRoutes(getCradle(cradle)),
        cradle,
        request('Bearer an-id-token'),
      );

      expect(state.logger.info).toHaveBeenCalledWith(
        'job.reminders.completed',
        expect.objectContaining({ auth: 'oidc' }),
      );
    });
  });

  describe('when no trigger is configured at all', () => {
    it.each([
      [ADMIN_JOBS.TRASH_PURGE, trashPurgeRoutes],
      [ADMIN_JOBS.REMINDERS, remindersRoutes],
      [ADMIN_JOBS.DIGEST, digestRoutes],
      [ADMIN_JOBS.PUSH_NOTIFICATIONS, pushNotificationsRoutes],
    ])('%s answers 503 and says so in a log line', async (job, routes) => {
      vi.stubEnv(ENV.CRON_SECRET, undefined);
      const cradle = cradleWith({});

      const state = await runRoute(routes(getCradle(cradle)), cradle);

      expect(state.status).toBe(503);
      expect(state.logger.warn).toHaveBeenCalledWith(`job.${job}.misconfigured`, {
        job,
        reason: 'no_trigger_configured',
      });
      expect(state.logger.info).not.toHaveBeenCalled();
    });
  });

  it('registers each job on its own admin route', () => {
    const cradle = cradleWith({});
    expect(trashPurgeRoutes(getCradle(cradle))[0]!.path).toBe(ROUTES.TRASH_PURGE);
    expect(remindersRoutes(getCradle(cradle))[0]!.path).toBe(ROUTES.REMINDERS_SEND);
    expect(digestRoutes(getCradle(cradle))[0]!.path).toBe(ROUTES.DIGEST_SEND);
    expect(pushNotificationsRoutes(getCradle(cradle))[0]!.path).toBe(
      ROUTES.PUSH_NOTIFICATIONS_SEND,
    );
  });
});
