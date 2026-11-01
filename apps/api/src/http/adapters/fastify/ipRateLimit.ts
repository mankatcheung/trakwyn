import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Cradle } from '#src/http/container.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import { diScopeOf } from '#src/http/adapters/fastify/diScope.js';

/** The `Cradle` keys that hold a rate limiter. */
type LimiterKey = {
  [K in keyof Cradle]: Cradle[K] extends IRateLimiter ? K : never;
}[keyof Cradle];

/**
 * A Fastify `preHandler` that spends one attempt per client IP from the named
 * limiter and answers 429 once it is gone (JEF-483).
 *
 * For routes registered with a raw `fastify.route`, which sit outside the
 * use-case limiters: the unauthenticated OAuth redirects and the document
 * file stream. The key reads `<route>:ip:<address>`, category before the
 * variable part, so a rejection is logged as "an IP was limited on <route>"
 * without the address reaching the log (JEF-350).
 */
export function ipRateLimit(limiter: LimiterKey, route: string) {
  return async function rateLimitByIp(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const allowed = await diScopeOf(request).cradle[limiter].consume(`${route}:ip:${request.ip}`);
    if (!allowed) {
      await reply.code(429).send({ error: 'rate_limited' });
    }
  };
}
