import type { RouteDefinition } from '#src/http/ports/RouteDefinition.js';
import type { Cradle } from '#src/http/container.js';
import { ENV } from '#src/infrastructure/config/constants.js';
import { ROUTES } from '#src/http/constants.js';
import { isAuthorizedCronTrigger, isCronTriggerConfigured } from '#src/http/routes/cronAuth.js';

export function digestRoutes(getCradle: () => Cradle): RouteDefinition[] {
  return [
    {
      // POST is what the Cloud Scheduler job sends (infra/gcp/scheduler.tf);
      // GET kept so the route can be triggered by hand from a browser or curl.
      method: ['GET', 'POST'],
      path: ROUTES.DIGEST_SEND,
      handler: async (req, res) => {
        if (!isCronTriggerConfigured(ENV.DIGEST_ADMIN_SECRET)) {
          res.status(503).send({
            error:
              'Digest not configured (DIGEST_ADMIN_SECRET/CRON_SECRET/CRON_INVOKER_SA missing)',
          });
          return;
        }

        if (
          !(await isAuthorizedCronTrigger(
            req,
            ENV.DIGEST_ADMIN_SECRET,
            getCradle().oidcTokenVerifier,
          ))
        ) {
          res.status(401).send({ error: 'Unauthorized' });
          return;
        }

        const { sendWeeklyDigestUseCase, logger } = getCradle();
        try {
          const summary = await sendWeeklyDigestUseCase.execute();
          res.send({ ok: true, summary });
        } catch (err) {
          logger.error('Weekly digest failed', err);
          res.status(500).send({ error: 'Digest failed' });
        }
      },
    },
  ];
}
