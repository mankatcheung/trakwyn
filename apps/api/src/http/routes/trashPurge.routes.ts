import type { RouteDefinition } from '#src/http/ports/RouteDefinition.js';
import type { Cradle } from '#src/http/container.js';
import { ENV } from '#src/infrastructure/config/constants.js';
import { ROUTES } from '#src/http/constants.js';
import { isAuthorizedCronTrigger, isCronTriggerConfigured } from '#src/http/routes/cronAuth.js';

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
        if (!isCronTriggerConfigured(ENV.CRON_SECRET)) {
          res
            .status(503)
            .send({ error: 'Purge not configured (CRON_SECRET/CRON_INVOKER_SA missing)' });
          return;
        }

        if (!(await isAuthorizedCronTrigger(req, ENV.CRON_SECRET, getCradle().oidcTokenVerifier))) {
          res.status(401).send({ error: 'Unauthorized' });
          return;
        }

        const { purgeExpiredApplicationsUseCase, logger } = getCradle();
        try {
          const { purged, failed } = await purgeExpiredApplicationsUseCase.execute();
          res.send({ ok: failed === 0, purged, failed });
        } catch (err) {
          logger.error('Trash purge failed', err);
          res.status(500).send({ error: 'Purge failed' });
        }
      },
    },
  ];
}
