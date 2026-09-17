import {
  CircuitBreaker,
  CircuitBreakerOpenError,
} from '#src/infrastructure/cache/CircuitBreaker.js';
import type { IRedisClient } from '#src/infrastructure/cache/IRedisClient.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import { otelMetrics, type IMetrics } from '#src/infrastructure/observability/metrics.js';

const KEY_PREFIX = 'ratelimit:';

interface Deps {
  redis: IRedisClient;
  maxAttempts: number;
  windowMs: number;
  breaker?: CircuitBreaker;
  metrics?: IMetrics;
}

/**
 * Redis-backed IRateLimiter, shared across every serverless instance
 * (JEF-160). The in-memory `RateLimiter`'s buckets reset per-instance and
 * per-cold-start, so under Cloud Run's normal horizontal scaling the effective
 * limit becomes `maxAttempts × (warm instance count)`, not `maxAttempts` —
 * the same coherence bug `MemoryCache` had before JEF-127, except here it
 * means the rate limit doesn't actually limit anything.
 *
 * Unlike RedisCache's stampede lock, there's nothing extra to coordinate
 * here — Redis's INCR is atomic on its own, so a single command gives
 * correct cross-instance counting for free.
 *
 * On any Redis failure — a genuine error, or the circuit already open —
 * this fails OPEN (allows the request) rather than fails closed. A rate
 * limiter that occasionally under-limits during a rare Redis outage is far
 * preferable to one that locks every user out of login/password-reset/chat
 * because Redis had a blip; this mirrors RedisCache's own
 * graceful-degradation philosophy (falls back to a direct DB fetch rather
 * than failing the request).
 */
export class RedisRateLimiter implements IRateLimiter {
  private readonly redis: IRedisClient;
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly breaker: CircuitBreaker;

  private readonly metrics: IMetrics;

  constructor({ redis, maxAttempts, windowMs, breaker, metrics = otelMetrics }: Deps) {
    this.redis = redis;
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.metrics = metrics;
    this.breaker =
      breaker ??
      new CircuitBreaker({
        onStateChange: (from, to) => {
          console.warn(`[rate-limit] Redis circuit breaker ${from} -> ${to}`);
          metrics.recordCircuitTransition('rate_limit', from, to);
        },
      });
  }

  async consume(key: string): Promise<boolean> {
    try {
      const count = await this.breaker.execute(() => this.increment(key));
      return count <= this.maxAttempts;
    } catch (err) {
      this.metrics.recordFailOpen(
        'rate_limit',
        err instanceof CircuitBreakerOpenError ? 'circuit_open' : 'error',
      );
      if (!(err instanceof CircuitBreakerOpenError)) {
        console.error('[rate-limit] Redis error in consume — failing open (request allowed)', err);
      }
      return true;
    }
  }

  private async increment(key: string): Promise<number> {
    const redisKey = `${KEY_PREFIX}${key}`;
    // Atomically create the key with its window TTL baked in via SET NX PX —
    // avoids the classic "INCR then conditionally PEXPIRE" race, where a
    // crash between those two steps leaves a key with no expiry at all,
    // permanently stuck rate-limited for that key. Only a plain INCR is
    // needed on the (much more common) path where the key already exists.
    const created = await this.redis.set(redisKey, 1, { nx: true, px: this.windowMs });
    if (created !== null) return 1;
    return this.redis.incr(redisKey);
  }
}
