import { CACHE } from '#src/infrastructure/config/constants.js';
import { CircuitBreaker, CircuitBreakerOpenError } from './CircuitBreaker.js';
import type { ICache } from './ICache.js';
import type { IRedisClient } from './IRedisClient.js';
import { otelMetrics, type IMetrics } from '#src/infrastructure/observability/metrics.js';

/**
 * Cached values are wrapped in `{ v }` rather than stored raw. Upstash's GET
 * returns `null` both when a key is absent AND when the stored JSON value is
 * literally `null` — wrapping lets RedisCache tell "never cached" apart from
 * "cached, and the answer is null" (e.g. findById caching a genuine
 * not-found result), which several Cached*Repository callers rely on.
 */
interface Envelope<T> {
  v: T;
}

interface Deps {
  redis: IRedisClient;
  lockTtlMs?: number;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
  breaker?: CircuitBreaker;
  metrics?: IMetrics;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Matches exactly what Date.prototype.toISOString() produces.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/**
 * JSON has no Date type — Upstash's client JSON-encodes every value sent
 * over its REST API, so a cached Date field silently becomes an ISO string
 * (via Date.prototype.toJSON()) with nothing reviving it back on the way
 * out. Domain entities are typed with real `Date` fields throughout this
 * codebase, so a cache hit has to hand back the same shape a cache miss
 * (straight from Drizzle) would (see JEF-157 — GetCalendarEventsUseCase
 * crashed calling .getTime() on what a Redis hit had turned into a string).
 * Only the read side needs this: the write side already gets Date → ISO
 * string for free from JSON.stringify, that part was never broken.
 */
function reviveDates<T>(value: T): T {
  if (typeof value === 'string') {
    return (ISO_DATE_RE.test(value) ? new Date(value) : value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => reviveDates(item)) as T;
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) result[k] = reviveDates(v);
    return result as T;
  }
  return value;
}

/**
 * Redis-backed ICache, shared across every serverless instance — fixes the
 * cross-instance invalidation gap a per-instance MemoryCache has once more
 * than one instance is serving (JEF-127).
 *
 * getOrSet also guards against cache stampedes: on a miss, only the caller
 * that wins a short-lived NX lock actually calls `fetch`. Concurrent misses
 * for the same key (whether on this instance or another — the lock lives in
 * Redis, not in process memory) poll briefly for the winner's result instead
 * of every one of them hitting the DB at once. If the winner doesn't finish
 * within the poll budget (e.g. it crashed mid-fetch, or is just slow), a
 * waiter falls back to fetching directly itself rather than waiting forever
 * — accepting a small chance of a couple of duplicate fetches in that rare
 * case, which is still far better than the unmitigated thundering herd this
 * replaces.
 *
 * Every Redis call goes through a CircuitBreaker (JEF-159): Redis is an
 * add-on reliability/performance layer, not a dependency the app should go
 * down with. On any failure — a genuine Redis error, or the breaker already
 * being open — getOrSet falls back to calling `fetch` directly (skipping
 * the cache and the stampede lock, since neither can be coordinated without
 * Redis anyway); delete/deleteByPrefix swallow the failure, since a stale
 * entry that outlives its TTL is the same acceptable risk the cache design
 * already accepts, and there's nothing else useful to do with a failed
 * invalidation.
 */
export class RedisCache implements ICache {
  private readonly redis: IRedisClient;
  private readonly lockTtlMs: number;
  private readonly pollIntervalMs: number;
  private readonly maxPollAttempts: number;
  private readonly breaker: CircuitBreaker;
  private readonly metrics: IMetrics;

  constructor({
    redis,
    lockTtlMs = CACHE.STAMPEDE_LOCK_TTL_MS,
    pollIntervalMs = CACHE.STAMPEDE_POLL_INTERVAL_MS,
    maxPollAttempts = CACHE.STAMPEDE_MAX_POLL_ATTEMPTS,
    breaker,
    metrics = otelMetrics,
  }: Deps) {
    this.redis = redis;
    this.lockTtlMs = lockTtlMs;
    this.pollIntervalMs = pollIntervalMs;
    this.maxPollAttempts = maxPollAttempts;
    this.metrics = metrics;
    this.breaker =
      breaker ??
      new CircuitBreaker({
        onStateChange: (from, to) => {
          console.warn(`[cache] Redis circuit breaker ${from} -> ${to}`);
          metrics.recordCircuitTransition('cache', from, to);
        },
      });
  }

  async getOrSet<T>(
    key: string,
    fetch: () => Promise<T>,
    ttlMs = CACHE.DEFAULT_TTL_MS,
  ): Promise<T> {
    try {
      return await this.getOrSetViaRedis(key, fetch, ttlMs);
    } catch (err) {
      this.metrics.recordFailOpen(
        'cache',
        err instanceof CircuitBreakerOpenError ? 'circuit_open' : 'error',
      );
      if (!(err instanceof CircuitBreakerOpenError)) {
        console.error('[cache] Redis error in getOrSet — falling back to a direct fetch', err);
      }
      // Note: if `fetch` inside getOrSetViaRedis already succeeded and only
      // the write-back to Redis failed, this calls it a second time. Rare
      // (a mid-flight failure at exactly that step) and low-cost enough
      // that avoiding it isn't worth the extra branching.
      return fetch();
    }
  }

  private async getOrSetViaRedis<T>(
    key: string,
    fetch: () => Promise<T>,
    ttlMs: number,
  ): Promise<T> {
    const hit = await this.breaker.execute(() => this.redis.get<Envelope<T>>(key));
    if (hit !== null) return reviveDates(hit.v);

    const lockKey = `lock:${key}`;
    const acquired = await this.breaker.execute(() =>
      this.redis.set(lockKey, '1', { nx: true, px: this.lockTtlMs }),
    );

    if (acquired !== null) {
      try {
        const value = await fetch();
        await this.breaker.execute(() =>
          this.redis.set(key, { v: value } satisfies Envelope<T>, { px: ttlMs }),
        );
        return value;
      } finally {
        // Best-effort: an unlock failure isn't worth discarding an
        // otherwise-successful result over — the lock's own PX ttl
        // (lockTtlMs) expires it regardless.
        await this.breaker.execute(() => this.redis.del(lockKey)).catch(() => {});
      }
    }

    for (let i = 0; i < this.maxPollAttempts; i++) {
      await sleep(this.pollIntervalMs);
      const retry = await this.breaker.execute(() => this.redis.get<Envelope<T>>(key));
      if (retry !== null) return reviveDates(retry.v);
    }

    // The lock-holder didn't finish in time — fetch directly rather than
    // waiting forever, and still populate the cache for the next reader.
    const value = await fetch();
    await this.breaker.execute(() =>
      this.redis.set(key, { v: value } satisfies Envelope<T>, { px: ttlMs }),
    );
    return value;
  }

  async delete(key: string): Promise<void> {
    try {
      await this.breaker.execute(() => this.redis.del(key));
    } catch (err) {
      this.metrics.recordFailOpen(
        'cache',
        err instanceof CircuitBreakerOpenError ? 'circuit_open' : 'error',
      );
      if (!(err instanceof CircuitBreakerOpenError)) {
        console.error('[cache] Redis error while deleting a cache key — invalidation skipped', err);
      }
    }
  }

  /**
   * No native "delete by prefix" in Redis — walks the keyspace with SCAN
   * (cursor-based, non-blocking) matching `${prefix}*` and deletes matches
   * in batches. Fine at this app's scale; would need a per-prefix key-set
   * index instead if the keyspace ever grew large enough for a full SCAN
   * pass to become expensive.
   */
  async deleteByPrefix(prefix: string): Promise<void> {
    try {
      let cursor: string | number = '0';
      do {
        const [next, keys] = await this.breaker.execute(() =>
          this.redis.scan(cursor, { match: `${prefix}*`, count: 100 }),
        );
        if (keys.length > 0) await this.breaker.execute(() => this.redis.del(...keys));
        cursor = next;
      } while (cursor !== '0');
    } catch (err) {
      this.metrics.recordFailOpen(
        'cache',
        err instanceof CircuitBreakerOpenError ? 'circuit_open' : 'error',
      );
      if (!(err instanceof CircuitBreakerOpenError)) {
        console.error(
          '[cache] Redis error while deleting cache keys by prefix — invalidation skipped',
          err,
        );
      }
    }
  }
}
