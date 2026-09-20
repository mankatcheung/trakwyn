import type { RouteDefinition } from '#src/http/ports/RouteDefinition.js';
import type { Cradle } from '#src/http/container.js';
import { ENV } from '#src/infrastructure/config/constants.js';
import { ADMIN_JOBS, ROUTES } from '#src/http/constants.js';
import { authorizeCronTrigger, isCronTriggerConfigured } from '#src/http/routes/cronAuth.js';
import { logScheduledJobMisconfigured, runScheduledJob } from '#src/http/routes/runScheduledJob.js';

/**
 * Removes applications that have served their thirty days in Trash. Driven by
 * Cloud Scheduler (infra/gcp/scheduler.tf), alongside the digest and reminder
 * routes it is modelled on.
 *
 * Reports the failure count rather than swallowing it: the use case keeps going
 * past a failure so one unreachable blob cannot strand everything behind it,
 * which would otherwise make a partial run indistinguishable from a clean one.
 */
export function trashPurgeRoutes(getCradle: () => Cradle): RouteDefinition[] {
  return [
    {
      method: ['GET', 'POST'],
      path: ROUTES.TRASH_PURGE,
      handler: async (req, res) => {
        const { logger, oidcTokenVerifier } = getCradle();

        if (!isCronTriggerConfigured(ENV.CRON_SECRET)) {
          logScheduledJobMisconfigured(logger, ADMIN_JOBS.TRASH_PURGE, 'no_trigger_configured');
          res
            .status(503)
            .send({ error: 'Purge not configured (CRON_SECRET/CRON_INVOKER_SA missing)' });
          return;
        }

        const auth = await authorizeCronTrigger(req, ENV.CRON_SECRET, oidcTokenVerifier);
        if (!auth) {
          res.status(401).send({ error: 'Unauthorized' });
          return;
        }

        const { purgeExpiredApplicationsUseCase } = getCradle();
        const outcome = await runScheduledJob({
          job: ADMIN_JOBS.TRASH_PURGE,
          auth,
          logger,
          execute: () => purgeExpiredApplicationsUseCase.execute(),
          summarize: ({ purged, failed }) => ({ processed: purged, failed }),
        });

        if (outcome.status === 'failed') {
          res.status(500).send({ error: 'Purge failed' });
          return;
        }

        const { purged, failed } = outcome.result;
        res.send({ ok: failed === 0, purged, failed });
      },
    },
  ];
}
