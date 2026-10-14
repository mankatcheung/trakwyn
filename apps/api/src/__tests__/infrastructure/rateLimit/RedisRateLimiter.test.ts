import { describe, it, expect, vi } from 'vitest';
import { RedisRateLimiter } from '#src/infrastructure/rateLimit/RedisRateLimiter.js';
import { CircuitBreaker } from '#src/infrastructure/cache/CircuitBreaker.js';
import type { IRedisClient } from '#src/infrastructure/cache/IRedisClient.js';

/**
 * Minimal in-memory stand-in for @upstash/redis's client, faithful to real
 * SET NX/PX and INCR semantics — enough to exercise RedisRateLimiter's
 * actual fixed-window logic (including the atomic-creation path) without a
 * network call. `get`/`del`/`scan` aren't used by RedisRateLimiter but are
 * still implemented to satisfy IRedisClient.
 */
class FakeRedisClient implements IRedisClient {
  private readonly store = new Map<string, { value: unknown; expiresAt: number | null }>();

  failing = false;

  private checkFailing(): void {
    if (this.failing) throw new Error('Redis unavailable');
  }

  private isLive(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  async get<T>(key: string): Promise<T | null> {
    this.checkFailing();
    return this.isLive(key) ? (this.store.get(key)!.value as T) : null;
  }

  async set(key: string, value: unknown, opts?: { nx?: true; px?: number }): Promise<unknown> {
    this.checkFailing();
    if (opts?.nx && this.isLive(key)) return null;
    this.store.set(key, { value, expiresAt: opts?.px ? Date.now() + opts.px : null });
    return 'OK';
  }

  async incr(key: string): Promise<number> {
    this.checkFailing();
    const entry = this.isLive(key) ? this.store.get(key)! : undefined;
    const next = (typeof entry?.value === 'number' ? entry.value : 0) + 1;
    this.store.set(key, { value: next, expiresAt: entry?.expiresAt ?? null });
    return next;
  }

  async del(...keys: string[]): Promise<number> {
    this.checkFailing();
    let count = 0;
    for (const key of keys) if (this.store.delete(key)) count++;
    return count;
  }

  async scan(): Promise<[string, string[]]> {
    this.checkFailing();
    return ['0', []];
  }
}

function makeLimiter(maxAttempts: number, windowMs: number, breaker?: CircuitBreaker) {
  const redis = new FakeRedisClient();
  const limiter = new RedisRateLimiter({ redis, maxAttempts, windowMs, breaker });
  return { limiter, redis };
}

describe('RedisRateLimiter', () => {
  it('allows requests up to the configured maximum within the window', async () => {
    const { limiter } = makeLimiter(3, 60_000);

    expect(await limiter.consume('key-1')).toBe(true);
    expect(await limiter.consume('key-1')).toBe(true);
    expect(await limiter.consume('key-1')).toBe(true);
  });

  it('rejects requests once the maximum is exceeded within the window', async () => {
    const { limiter } = makeLimiter(2, 60_000);

    expect(await limiter.consume('key-1')).toBe(true);
    expect(await limiter.consume('key-1')).toBe(true);
    expect(await limiter.consume('key-1')).toBe(false);
  });

  it('tracks separate keys independently', async () => {
    const { limiter } = makeLimiter(1, 60_000);

    expect(await limiter.consume('key-1')).toBe(true);
    expect(await limiter.consume('key-2')).toBe(true);
    expect(await limiter.consume('key-1')).toBe(false);
    expect(await limiter.consume('key-2')).toBe(false);
  });

  it('resets the count once the window has elapsed', async () => {
    const { limiter } = makeLimiter(1, 10);

    expect(await limiter.consume('key-1')).toBe(true);
    expect(await limiter.consume('key-1')).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(await limiter.consume('key-1')).toBe(true);
  });

  it('is coherent across two independent limiter instances sharing the same store (simulates two serverless instances)', async () => {
    const redis = new FakeRedisClient();
    const limiterA = new RedisRateLimiter({ redis, maxAttempts: 2, windowMs: 60_000 });
    const limiterB = new RedisRateLimiter({ redis, maxAttempts: 2, windowMs: 60_000 });

    expect(await limiterA.consume('shared-key')).toBe(true);
    expect(await limiterB.consume('shared-key')).toBe(true);
    // The third attempt, regardless of which "instance" makes it, sees the
    // count already at 2 — this is exactly the coherence JEF-160 restores.
    expect(await limiterA.consume('shared-key')).toBe(false);
  });

  describe('isLimited', () => {
    it('turns true once the maximum has been consumed, without spending an attempt itself', async () => {
      const { limiter } = makeLimiter(2, 60_000);

      expect(await limiter.isLimited('key-1')).toBe(false);
      await limiter.consume('key-1');
      expect(await limiter.isLimited('key-1')).toBe(false);
      await limiter.consume('key-1');
      expect(await limiter.isLimited('key-1')).toBe(true);
      expect(await limiter.isLimited('key-1')).toBe(true);
    });

    it('fails open when Redis errors', async () => {
      const { limiter, redis } = makeLimiter(1, 60_000);
      await limiter.consume('key-1');
      redis.failing = true;

      await expect(limiter.isLimited('key-1')).resolves.toBe(false);
    });
  });

  describe('resilience to Redis failures', () => {
    it('fails open (allows the request) when Redis errors, instead of throwing', async () => {
      const { limiter, redis } = makeLimiter(1, 60_000);
      redis.failing = true;

      await expect(limiter.consume('key-1')).resolves.toBe(true);
    });

    it('opens the circuit after repeated failures and stops calling Redis at all', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 60_000 });
      const { limiter, redis } = makeLimiter(1, 60_000, breaker);
      redis.failing = true;

      await limiter.consume('key-1'); // trips the breaker open

      const setSpy = vi.spyOn(redis, 'set');
      const incrSpy = vi.spyOn(redis, 'incr');
      const result = await limiter.consume('key-1');

      expect(result).toBe(true); // still fails open
      expect(setSpy).not.toHaveBeenCalled();
      expect(incrSpy).not.toHaveBeenCalled();
    });
  });
});
