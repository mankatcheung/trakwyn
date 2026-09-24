import type { RouteDefinition } from '#src/http/ports/RouteDefinition.js';
import type { Cradle } from '#src/http/container.js';
import { ENV } from '#src/infrastructure/config/constants.js';
import { ADMIN_JOBS, ROUTES } from '#src/http/constants.js';
import { authorizeCronTrigger, isCronTriggerConfigured } from '#src/http/routes/cronAuth.js';
import { logScheduledJobMisconfigured, runScheduledJob } from '#src/http/routes/runScheduledJob.js';

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
        const { logger, oidcTokenVerifier } = getCradle();

        if (!isCronTriggerConfigured(ENV.CRON_SECRET)) {
          logScheduledJobMisconfigured(logger, ADMIN_JOBS.REMINDERS, 'no_trigger_configured');
          res
            .status(503)
            .send({ error: 'Reminders not configured (CRON_SECRET/CRON_INVOKER_SA missing)' });
          return;
        }

        const auth = await authorizeCronTrigger(req, ENV.CRON_SECRET, oidcTokenVerifier, {
          job: ADMIN_JOBS.REMINDERS,
          logger,
        });
        if (!auth) {
          res.status(401).send({ error: 'Unauthorized' });
          return;
        }

        const { sendFollowUpRemindersUseCase } = getCradle();
        const outcome = await runScheduledJob({
          job: ADMIN_JOBS.REMINDERS,
          auth,
          logger,
          execute: () => sendFollowUpRemindersUseCase.execute(),
          summarize: ({ sent, failed }) => ({ processed: sent, failed }),
        });

        if (outcome.status === 'failed') {
          res.status(500).send({ error: 'Reminders failed' });
          return;
        }

        const { sent, failed, skipped } = outcome.result;
        res.send({ ok: failed === 0, sent, failed, skipped });
      },
    },
  ];
}
