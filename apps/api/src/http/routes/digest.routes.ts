import type { RouteDefinition } from '#src/http/ports/RouteDefinition.js';
import type { Cradle } from '#src/http/container.js';
import { ENV } from '#src/infrastructure/config/constants.js';
import { ADMIN_JOBS, ROUTES } from '#src/http/constants.js';
import { authorizeCronTrigger, isCronTriggerConfigured } from '#src/http/routes/cronAuth.js';
import { logScheduledJobMisconfigured, runScheduledJob } from '#src/http/routes/runScheduledJob.js';

export function digestRoutes(getCradle: () => Cradle): RouteDefinition[] {
  return [
    {
      // POST is what the Cloud Scheduler job sends (infra/gcp/scheduler.tf);
      // GET kept so the route can be triggered by hand from a browser or curl.
      method: ['GET', 'POST'],
      path: ROUTES.DIGEST_SEND,
      handler: async (req, res) => {
        const { logger, oidcTokenVerifier } = getCradle();

        if (!isCronTriggerConfigured(ENV.DIGEST_ADMIN_SECRET)) {
          logScheduledJobMisconfigured(logger, ADMIN_JOBS.DIGEST, 'no_trigger_configured');
          res.status(503).send({
            error:
              'Digest not configured (DIGEST_ADMIN_SECRET/CRON_SECRET/CRON_INVOKER_SA missing)',
          });
          return;
        }

        const auth = await authorizeCronTrigger(req, ENV.DIGEST_ADMIN_SECRET, oidcTokenVerifier);
        if (!auth) {
          res.status(401).send({ error: 'Unauthorized' });
          return;
        }

        const { sendWeeklyDigestUseCase } = getCradle();
        const outcome = await runScheduledJob({
          job: ADMIN_JOBS.DIGEST,
          auth,
          logger,
          execute: () => sendWeeklyDigestUseCase.execute(),
          summarize: ({ sent, failed }) => ({ processed: sent, failed }),
        });

        if (outcome.status === 'failed') {
          res.status(500).send({ error: 'Digest failed' });
          return;
        }

        res.send({ ok: true, summary: outcome.result });
      },
    },
  ];
}
