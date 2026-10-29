import { sql } from 'drizzle-orm';
import type { Cradle } from '#src/http/container.js';
import type { RouteDefinition } from '#src/http/ports/RouteDefinition.js';
import { ROUTES } from '#src/http/constants.js';

/**
 * Whether this instance can reach its database (JEF-476). `/health` is Cloud
 * Run's startup probe and stays a static answer, so it proves the process
 * booted and nothing more. CI calls this one on a revision that has no
 * traffic yet: a bad secret or an unreachable database fails here, before the
 * revision is promoted.
 *
 * The body never says why it failed; the cause goes to the log.
 */
export function readyRoutes(getCradle: () => Cradle): RouteDefinition[] {
  return [
    {
      method: 'GET',
      path: ROUTES.READY,
      handler: async (_req, res) => {
        const { db, logger } = getCradle();
        try {
          await db.execute(sql`select 1`);
        } catch (error) {
          logger.error('Readiness check failed', error);
          res.status(503).send({ status: 'unavailable' });
          return;
        }
        res.send({ status: 'ok' });
      },
    },
  ];
}
