import type { RouteDefinition } from '#src/http/ports/RouteDefinition.js';
import type { Cradle } from '#src/http/container.js';
import { ENV } from '#src/infrastructure/config/constants.js';
import { ADMIN_JOBS, ROUTES } from '#src/http/constants.js';
import { authorizeCronTrigger, isCronTriggerConfigured } from '#src/http/routes/cronAuth.js';
import { logScheduledJobMisconfigured, runScheduledJob } from '#src/http/routes/runScheduledJob.js';

/**
 * Deletes accounts whose deletion grace period has run out (JEF-463). Driven
 * daily by Cloud Scheduler (infra/gcp/scheduler.tf), the same way as the
 * trash purge it is modelled on.
 *
 * Reports failures rather than swallowing them: the use case keeps going past
 * a failed account so one unreachable provider cannot strand everyone behind
 * it, and a failed account is retried on the next run.
 */
export function accountPurgeRoutes(getCradle: () => Cradle): RouteDefinition[] {
  return [
    {
      method: ['GET', 'POST'],
      path: ROUTES.ACCOUNT_PURGE,
      handler: async (req, res) => {
        const { logger, oidcTokenVerifier } = getCradle();

        if (!isCronTriggerConfigured(ENV.CRON_SECRET)) {
          logScheduledJobMisconfigured(logger, ADMIN_JOBS.ACCOUNT_PURGE, 'no_trigger_configured');
          res
            .status(503)
            .send({ error: 'Purge not configured (CRON_SECRET/CRON_INVOKER_SA missing)' });
          return;
        }

        const auth = await authorizeCronTrigger(req, ENV.CRON_SECRET, oidcTokenVerifier, {
          job: ADMIN_JOBS.ACCOUNT_PURGE,
          logger,
        });
        if (!auth) {
          res.status(401).send({ error: 'Unauthorized' });
          return;
        }

        const { purgeScheduledAccountsUseCase } = getCradle();
        const outcome = await runScheduledJob({
          job: ADMIN_JOBS.ACCOUNT_PURGE,
          auth,
          logger,
          execute: () => purgeScheduledAccountsUseCase.execute(),
          summarize: ({ purged, failed }) => ({ processed: purged, failed }),
        });

        if (outcome.status === 'failed') {
          res.status(500).send({ error: 'Purge failed' });
          return;
        }

        const { purged, failed, overdue } = outcome.result;
        res.send({ ok: failed === 0, purged, failed, overdue });
      },
    },
  ];
}
