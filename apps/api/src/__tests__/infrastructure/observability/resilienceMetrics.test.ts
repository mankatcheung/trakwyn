import { describe, it, expect } from 'vitest';
import { RedisCache } from '#src/infrastructure/cache/RedisCache.js';
import { RedisRateLimiter } from '#src/infrastructure/rateLimit/RedisRateLimiter.js';
import { RedisSessionBlocklist } from '#src/infrastructure/sessionBlocklist/RedisSessionBlocklist.js';
import { CircuitBreaker } from '#src/infrastructure/resilience/CircuitBreaker.js';
import type { IRedisClient } from '#src/infrastructure/cache/IRedisClient.js';
import { makeFakeMetrics } from '#src/__tests__/helpers/fakeMetrics.js';

/** Always-failing Redis stand-in — every method rejects. */
class BrokenRedisClient implements IRedisClient {
  async get(): Promise<never> {
    throw new Error('Redis unavailable');
  }
  async set(): Promise<never> {
    throw new Error('Redis unavailable');
  }
  async incr(): Promise<never> {
    throw new Error('Redis unavailable');
  }
  async del(): Promise<never> {
    throw new Error('Redis unavailable');
  }
  async scan(): Promise<never> {
    throw new Error('Redis unavailable');
  }
}

/**
 * Every Redis-backed subsystem degrades gracefully rather than failing the
 * request — which makes an outage invisible without these counters. That's
 * the gap JEF-129 closes, and it matters most for rate limiting and session
 * revocation, where silent degradation is a security-relevant state.
 */
describe('fail-open metrics (JEF-129)', () => {
  describe('RedisCache', () => {
    it('records a fail-open when getOrSet falls back to a direct fetch', async () => {
      const metrics = makeFakeMetrics();
      const cache = new RedisCache({ redis: new BrokenRedisClient(), metrics });

      await expect(cache.getOrSet('key-1', async () => 'value')).resolves.toBe('value');

      expect(metrics.failOpens).toContainEqual({ component: 'cache', reason: 'error' });
    });

    it('records a fail-open when an invalidation is skipped', async () => {
      const metrics = makeFakeMetrics();
      const cache = new RedisCache({ redis: new BrokenRedisClient(), metrics });

      await cache.delete('key-1');
      await cache.deleteByPrefix('prefix:');

      expect(metrics.failOpens.filter((e) => e.component === 'cache')).toHaveLength(2);
    });
  });

  describe('RedisRateLimiter', () => {
    it('records a fail-open when a request is allowed through unlimited', async () => {
      const metrics = makeFakeMetrics();
      const limiter = new RedisRateLimiter({
        redis: new BrokenRedisClient(),
        maxAttempts: 1,
        windowMs: 60_000,
        metrics,
      });

      await expect(limiter.consume('key-1')).resolves.toBe(true);

      expect(metrics.failOpens).toContainEqual({ component: 'rate_limit', reason: 'error' });
    });
  });

  describe('RedisSessionBlocklist', () => {
    it('records a fail-open when a revoked session is treated as still valid', async () => {
      const metrics = makeFakeMetrics();
      const blocklist = new RedisSessionBlocklist({ redis: new BrokenRedisClient(), metrics });

      await expect(blocklist.isRevoked('session-1')).resolves.toBe(false);

      expect(metrics.failOpens).toContainEqual({
        component: 'session_blocklist',
        reason: 'error',
      });
    });

    it('records a fail-open when a revocation fails to reach the blocklist', async () => {
      const metrics = makeFakeMetrics();
      const blocklist = new RedisSessionBlocklist({ redis: new BrokenRedisClient(), metrics });

      await blocklist.revoke('session-1');

      expect(metrics.failOpens).toContainEqual({
        component: 'session_blocklist',
        reason: 'error',
      });
    });
  });

  it('distinguishes a short-circuited call from a genuine Redis error', async () => {
    const metrics = makeFakeMetrics();
    const limiter = new RedisRateLimiter({
      redis: new BrokenRedisClient(),
      maxAttempts: 1,
      windowMs: 60_000,
      breaker: new CircuitBreaker({ failureThreshold: 1, cooldownMs: 60_000 }),
      metrics,
    });

    await limiter.consume('key-1'); // trips the breaker
    await limiter.consume('key-1'); // short-circuited, Redis never called

    expect(metrics.failOpens).toEqual([
      { component: 'rate_limit', reason: 'error' },
      { component: 'rate_limit', reason: 'circuit_open' },
    ]);
  });
});

describe('circuit-breaker transition metrics (JEF-129)', () => {
  it('records the closed -> open transition for the cache', async () => {
    const metrics = makeFakeMetrics();
    const cache = new RedisCache({ redis: new BrokenRedisClient(), metrics });

    // Default threshold is >1, so drive enough failures to trip it.
    for (let i = 0; i < 10; i++) await cache.getOrSet(`key-${i}`, async () => 'value');

    expect(metrics.circuitTransitions).toContainEqual({
      component: 'cache',
      from: 'closed',
      to: 'open',
    });
  });

  it('records the transition for the rate limiter', async () => {
    const metrics = makeFakeMetrics();
    const limiter = new RedisRateLimiter({
      redis: new BrokenRedisClient(),
      maxAttempts: 5,
      windowMs: 60_000,
      metrics,
    });

    for (let i = 0; i < 10; i++) await limiter.consume(`key-${i}`);

    expect(metrics.circuitTransitions).toContainEqual({
      component: 'rate_limit',
      from: 'closed',
      to: 'open',
    });
  });

  it('records the transition for the session blocklist', async () => {
    const metrics = makeFakeMetrics();
    const blocklist = new RedisSessionBlocklist({ redis: new BrokenRedisClient(), metrics });

    for (let i = 0; i < 10; i++) await blocklist.isRevoked(`session-${i}`);

    expect(metrics.circuitTransitions).toContainEqual({
      component: 'session_blocklist',
      from: 'closed',
      to: 'open',
    });
  });
});
