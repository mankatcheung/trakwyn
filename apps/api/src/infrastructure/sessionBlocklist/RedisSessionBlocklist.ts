import {
  CircuitBreaker,
  CircuitBreakerOpenError,
} from '#src/infrastructure/cache/CircuitBreaker.js';
import type { IRedisClient } from '#src/infrastructure/cache/IRedisClient.js';
import { SESSION_BLOCKLIST } from '#src/infrastructure/config/constants.js';
import { otelMetrics, type IMetrics } from '#src/infrastructure/observability/metrics.js';
import { rootLogger } from '#src/infrastructure/observability/rootLogger.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import type { ISessionBlocklist } from '#src/use-cases/ports/ISessionBlocklist.js';

interface Deps {
  redis: IRedisClient;
  ttlMs?: number;
  breaker?: CircuitBreaker;
  metrics?: IMetrics;
  logger?: ILogger;
}

/**
 * Redis-backed ISessionBlocklist, shared across every serverless instance
 * (JEF-164). A per-instance blocklist would be useless here for the same
 * reason the in-memory cache and rate limiter were (JEF-127/160): the
 * instance that handled the logout is very often not the one that handles
 * the next request carrying the revoked token.
 *
 * Every call goes through a CircuitBreaker and **fails open** — a Redis
 * error, or the breaker already being open, is treated as "not revoked" and
 * the request proceeds. That deliberately mirrors RedisRateLimiter's
 * fail-open stance: this is a hardening layer that shrinks the revocation
 * window from ~15 minutes to ~immediate, so degrading back to the old
 * behaviour during an outage is acceptable, whereas failing closed would
 * unauthenticate the entire API the moment Redis blipped.
 *
 * `revoke()` failing open is the weaker direction (the revocation silently
 * doesn't take effect early), so it's logged as an error rather than
 * swallowed — but it still must not throw: the DB revocation it accompanies
 * has already succeeded and is the source of truth, and refresh-time checks
 * (`RotateRefreshTokenUseCase`) still enforce it within 15 minutes.
 */
export class RedisSessionBlocklist implements ISessionBlocklist {
  private readonly redis: IRedisClient;
  private readonly ttlMs: number;
  private readonly breaker: CircuitBreaker;

  private readonly metrics: IMetrics;
  private readonly logger: ILogger;

  constructor({
    redis,
    ttlMs = SESSION_BLOCKLIST.TTL_MS,
    breaker,
    metrics = otelMetrics,
    logger = rootLogger,
  }: Deps) {
    this.redis = redis;
    this.ttlMs = ttlMs;
    this.metrics = metrics;
    this.logger = logger;
    this.breaker =
      breaker ??
      new CircuitBreaker({
        onStateChange: (from, to) => {
          logger.warn(`[session-blocklist] Redis circuit breaker ${from} -> ${to}`);
          metrics.recordCircuitTransition('session_blocklist', from, to);
        },
      });
  }

  private key(sessionId: string): string {
    return `${SESSION_BLOCKLIST.KEY_PREFIX}${sessionId}`;
  }

  async revoke(sessionId: string): Promise<void> {
    try {
      await this.breaker.execute(() => this.redis.set(this.key(sessionId), 1, { px: this.ttlMs }));
    } catch (err) {
      this.metrics.recordFailOpen(
        'session_blocklist',
        err instanceof CircuitBreakerOpenError ? 'circuit_open' : 'error',
      );
      if (!(err instanceof CircuitBreakerOpenError)) {
        this.logger.error(
          '[session-blocklist] Redis error while blocklisting a revoked session — its access tokens stay valid until they expire',
          err,
        );
      }
    }
  }

  async isRevoked(sessionId: string): Promise<boolean> {
    try {
      const hit = await this.breaker.execute(() => this.redis.get<unknown>(this.key(sessionId)));
      return hit !== null;
    } catch (err) {
      this.metrics.recordFailOpen(
        'session_blocklist',
        err instanceof CircuitBreakerOpenError ? 'circuit_open' : 'error',
      );
      if (!(err instanceof CircuitBreakerOpenError)) {
        this.logger.error(
          '[session-blocklist] Redis error in isRevoked — failing open (request allowed)',
          err,
        );
      }
      return false;
    }
  }
}
