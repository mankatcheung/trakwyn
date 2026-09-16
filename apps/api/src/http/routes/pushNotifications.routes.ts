import type { RouteDefinition } from '#src/http/ports/RouteDefinition.js';
import type { Cradle } from '#src/http/container.js';
import { ENV } from '#src/infrastructure/config/constants.js';
import { ROUTES } from '#src/http/constants.js';
import { isAuthorizedCronTrigger } from '#src/http/routes/cronAuth.js';

/**
 * Push notification delivery triggered by an external cron job (a Render
 * Cron Job in production — see render.yaml), same pattern as
 * reminders.routes.ts and digest.routes.ts.
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
        if (!process.env[ENV.CRON_SECRET]) {
          res
            .status(503)
            .send({ error: 'Push notifications not configured (CRON_SECRET missing)' });
          return;
        }

        if (!process.env[ENV.VAPID_PUBLIC_KEY] || !process.env[ENV.VAPID_PRIVATE_KEY]) {
          res.status(503).send({ error: 'Push notifications not configured (VAPID keys missing)' });
          return;
        }

        if (!isAuthorizedCronTrigger(req, ENV.CRON_SECRET)) {
          res.status(401).send({ error: 'Unauthorized' });
          return;
        }

        const { sendPushNotificationsUseCase, logger } = getCradle();
        try {
          await sendPushNotificationsUseCase.execute();
          res.send({ ok: true });
        } catch (err) {
          logger.error('Push notifications failed', err);
          res.status(500).send({ error: 'Push notifications failed' });
        }
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
