import type { RouteDefinition } from '#src/http/ports/RouteDefinition.js';
import type { Cradle } from '#src/http/container.js';
import { ENV } from '#src/infrastructure/config/constants.js';
import { ADMIN_JOBS, ROUTES } from '#src/http/constants.js';
import { authorizeCronTrigger, isCronTriggerConfigured } from '#src/http/routes/cronAuth.js';
import { logScheduledJobMisconfigured, runScheduledJob } from '#src/http/routes/runScheduledJob.js';

/**
 * Push notification delivery triggered by an external cron job, same pattern
 * as reminders.routes.ts and digest.routes.ts. Unlike those, no production
 * schedule drives it (there was none on Vercel either, and
 * infra/gcp/scheduler.tf keeps that), so it only runs when triggered by hand.
 *
 * Also serves the VAPID public key so the web client can create push
 * subscriptions without baking the key into the client bundle.
 */
export function pushNotificationsRoutes(getCradle: () => Cradle): RouteDefinition[] {
  return [
    // Cron-triggered push notification delivery
    {
      method: ['GET', 'POST'],
      path: ROUTES.PUSH_NOTIFICATIONS_SEND,
      handler: async (req, res) => {
        const { logger, oidcTokenVerifier } = getCradle();

        if (!isCronTriggerConfigured(ENV.CRON_SECRET)) {
          logScheduledJobMisconfigured(
            logger,
            ADMIN_JOBS.PUSH_NOTIFICATIONS,
            'no_trigger_configured',
          );
          res.status(503).send({
            error: 'Push notifications not configured (CRON_SECRET/CRON_INVOKER_SA missing)',
          });
          return;
        }

        if (!process.env[ENV.VAPID_PUBLIC_KEY] || !process.env[ENV.VAPID_PRIVATE_KEY]) {
          logScheduledJobMisconfigured(logger, ADMIN_JOBS.PUSH_NOTIFICATIONS, 'vapid_keys_missing');
          res.status(503).send({ error: 'Push notifications not configured (VAPID keys missing)' });
          return;
        }

        const auth = await authorizeCronTrigger(req, ENV.CRON_SECRET, oidcTokenVerifier);
        if (!auth) {
          res.status(401).send({ error: 'Unauthorized' });
          return;
        }

        const { sendPushNotificationsUseCase } = getCradle();
        const outcome = await runScheduledJob({
          job: ADMIN_JOBS.PUSH_NOTIFICATIONS,
          auth,
          logger,
          execute: () => sendPushNotificationsUseCase.execute(),
          summarize: ({ delivered, failed }) => ({ processed: delivered, failed }),
        });

        if (outcome.status === 'failed') {
          res.status(500).send({ error: 'Push notifications failed' });
          return;
        }

        const { delivered, failed } = outcome.result;
        res.send({ ok: failed === 0, delivered, failed });
      },
    },

    // Public VAPID key endpoint — the client needs this to create a subscription
    {
      method: 'GET',
      path: ROUTES.VAPID_PUBLIC_KEY,
      handler: async (_req, res) => {
        const publicKey = process.env[ENV.VAPID_PUBLIC_KEY];
        if (!publicKey) {
          res.status(503).send({ error: 'VAPID not configured' });
          return;
        }
        res.send({ publicKey });
      },
    },
  ];
}
