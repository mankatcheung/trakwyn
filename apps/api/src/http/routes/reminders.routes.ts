import type { RouteDefinition } from '#src/http/ports/RouteDefinition.js';
import type { Cradle } from '#src/http/container.js';
import { ENV } from '#src/infrastructure/config/constants.js';
import { ROUTES } from '#src/http/constants.js';
import { isAuthorizedCronTrigger } from '#src/http/routes/cronAuth.js';

/**
 * Was an in-process setInterval poll; converted to an external-trigger route
 * (mirrors digest.routes.ts) because a setInterval can't survive a
 * scale-to-zero host — Cloud Run throttles CPU between requests and removes
 * idle instances, so nothing would reliably fire it. Driven by Cloud
 * Scheduler in production (infra/gcp/scheduler.tf).
 */
export function remindersRoutes(getCradle: () => Cradle): RouteDefinition[] {
  return [
    {
      method: ['GET', 'POST'],
      path: ROUTES.REMINDERS_SEND,
      handler: async (req, res) => {
        if (!process.env[ENV.CRON_SECRET]) {
          res.status(503).send({ error: 'Reminders not configured (CRON_SECRET missing)' });
          return;
        }

        if (!isAuthorizedCronTrigger(req, ENV.CRON_SECRET)) {
          res.status(401).send({ error: 'Unauthorized' });
          return;
        }

        const { sendFollowUpRemindersUseCase, logger } = getCradle();
        try {
          await sendFollowUpRemindersUseCase.execute();
          res.send({ ok: true });
        } catch (err) {
          logger.error('Follow-up reminders failed', err);
          res.status(500).send({ error: 'Reminders failed' });
        }
      },
    },
  ];
}
