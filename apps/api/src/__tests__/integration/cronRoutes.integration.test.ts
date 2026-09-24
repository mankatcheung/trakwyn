import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { ENV } from '#src/infrastructure/config/constants.js';
import { ROUTES } from '#src/http/constants.js';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';

describe('cron routes integration', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('shared cron auth (authorizeCronTrigger, exercised via /admin/reminders/send)', () => {
    it('returns 503 when CRON_SECRET is not configured', async () => {
      vi.stubEnv(ENV.CRON_SECRET, undefined);

      const res = await testApp.app.inject({ method: 'GET', url: ROUTES.REMINDERS_SEND });

      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual({ error: expect.stringContaining('not configured') });
    });

    it('returns 401 with no Authorization header', async () => {
      vi.stubEnv(ENV.CRON_SECRET, 'the-cron-secret');

      const res = await testApp.app.inject({ method: 'GET', url: ROUTES.REMINDERS_SEND });

      expect(res.statusCode).toBe(401);
    });

    it('returns 401 when the bearer token does not match the secret', async () => {
      vi.stubEnv(ENV.CRON_SECRET, 'the-cron-secret');

      const res = await testApp.app.inject({
        method: 'GET',
        url: ROUTES.REMINDERS_SEND,
        headers: { authorization: 'Bearer wrong-secret' },
      });

      expect(res.statusCode).toBe(401);
    });

    it('returns 200 when the bearer token matches CRON_SECRET', async () => {
      vi.stubEnv(ENV.CRON_SECRET, 'the-cron-secret');

      const res = await testApp.app.inject({
        method: 'GET',
        url: ROUTES.REMINDERS_SEND,
        headers: { authorization: 'Bearer the-cron-secret' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true, sent: 0, failed: 0, skipped: 0 });
    });
  });

  describe('/admin/reminders/send', () => {
    it('fires SendFollowUpRemindersUseCase and returns ok', async () => {
      vi.stubEnv(ENV.CRON_SECRET, 'the-cron-secret');

      const res = await testApp.app.inject({
        method: 'GET',
        url: ROUTES.REMINDERS_SEND,
        headers: { authorization: 'Bearer the-cron-secret' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true, sent: 0, failed: 0, skipped: 0 });
    });
  });

  describe('/admin/digest/send', () => {
    it('returns 503 when neither DIGEST_ADMIN_SECRET nor CRON_SECRET is configured', async () => {
      vi.stubEnv(ENV.DIGEST_ADMIN_SECRET, undefined);
      vi.stubEnv(ENV.CRON_SECRET, undefined);

      const res = await testApp.app.inject({ method: 'GET', url: ROUTES.DIGEST_SEND });

      expect(res.statusCode).toBe(503);
    });

    it('accepts its own DIGEST_ADMIN_SECRET even when CRON_SECRET differs', async () => {
      vi.stubEnv(ENV.DIGEST_ADMIN_SECRET, 'the-digest-secret');
      vi.stubEnv(ENV.CRON_SECRET, 'a-different-cron-secret');

      const res = await testApp.app.inject({
        method: 'GET',
        url: ROUTES.DIGEST_SEND,
        headers: { authorization: 'Bearer the-digest-secret' },
      });

      expect(res.statusCode).toBe(200);
    });

    it('fires SendWeeklyDigestUseCase and returns a summary', async () => {
      vi.stubEnv(ENV.CRON_SECRET, 'the-cron-secret');

      const res = await testApp.app.inject({
        method: 'GET',
        url: ROUTES.DIGEST_SEND,
        headers: { authorization: 'Bearer the-cron-secret' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as { ok: boolean; summary: unknown };
      expect(body.ok).toBe(true);
      expect(body.summary).toEqual(
        expect.objectContaining({
          totalUsers: expect.any(Number) as number,
          sent: expect.any(Number) as number,
          skipped: expect.any(Number) as number,
        }),
      );
    });
  });

  describe('/admin/push-notifications/send', () => {
    it('returns 503 when CRON_SECRET is missing, even with VAPID keys configured', async () => {
      vi.stubEnv(ENV.CRON_SECRET, undefined);
      vi.stubEnv(ENV.VAPID_PUBLIC_KEY, 'public-key');
      vi.stubEnv(ENV.VAPID_PRIVATE_KEY, 'private-key');

      const res = await testApp.app.inject({ method: 'GET', url: ROUTES.PUSH_NOTIFICATIONS_SEND });

      expect(res.statusCode).toBe(503);
    });

    it('returns 503 when VAPID keys are missing, even with CRON_SECRET configured', async () => {
      vi.stubEnv(ENV.CRON_SECRET, 'the-cron-secret');
      vi.stubEnv(ENV.VAPID_PUBLIC_KEY, undefined);
      vi.stubEnv(ENV.VAPID_PRIVATE_KEY, undefined);

      const res = await testApp.app.inject({
        method: 'GET',
        url: ROUTES.PUSH_NOTIFICATIONS_SEND,
        headers: { authorization: 'Bearer the-cron-secret' },
      });

      expect(res.statusCode).toBe(503);
    });

    it('fires SendPushNotificationsUseCase and returns ok when fully configured', async () => {
      vi.stubEnv(ENV.CRON_SECRET, 'the-cron-secret');
      vi.stubEnv(ENV.VAPID_PUBLIC_KEY, 'public-key');
      vi.stubEnv(ENV.VAPID_PRIVATE_KEY, 'private-key');

      const res = await testApp.app.inject({
        method: 'GET',
        url: ROUTES.PUSH_NOTIFICATIONS_SEND,
        headers: { authorization: 'Bearer the-cron-secret' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true, delivered: 0, failed: 0 });
    });
  });

  describe('/vapid-public-key', () => {
    it('returns 503 when VAPID_PUBLIC_KEY is not configured', async () => {
      vi.stubEnv(ENV.VAPID_PUBLIC_KEY, undefined);

      const res = await testApp.app.inject({ method: 'GET', url: ROUTES.VAPID_PUBLIC_KEY });

      expect(res.statusCode).toBe(503);
    });

    it('returns the public key with no auth required when configured', async () => {
      vi.stubEnv(ENV.VAPID_PUBLIC_KEY, 'public-key');

      const res = await testApp.app.inject({ method: 'GET', url: ROUTES.VAPID_PUBLIC_KEY });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ publicKey: 'public-key' });
    });
  });
});
