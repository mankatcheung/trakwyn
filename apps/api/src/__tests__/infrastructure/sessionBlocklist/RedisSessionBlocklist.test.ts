import { describe, it, expect, vi } from 'vitest';
import { RedisSessionBlocklist } from '#src/infrastructure/sessionBlocklist/RedisSessionBlocklist.js';
import { CircuitBreaker } from '#src/infrastructure/resilience/CircuitBreaker.js';
import type { IRedisClient } from '#src/infrastructure/cache/IRedisClient.js';

/**
 * Minimal in-memory stand-in for @upstash/redis's client, faithful to real
 * SET PX / GET semantics — enough to exercise RedisSessionBlocklist without a
 * network call. Mirrors the fake in RedisRateLimiter.test.ts.
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

describe('RedisSessionBlocklist', () => {
  it('reports a revoked session as revoked', async () => {
    const blocklist = new RedisSessionBlocklist({ redis: new FakeRedisClient() });

    await blocklist.revoke('session-1');

    expect(await blocklist.isRevoked('session-1')).toBe(true);
  });

  it('reports an unknown session as not revoked', async () => {
    const blocklist = new RedisSessionBlocklist({ redis: new FakeRedisClient() });

    expect(await blocklist.isRevoked('never-seen')).toBe(false);
  });

  it('expires the entry after its TTL, once every access token it covered has expired anyway', async () => {
    const blocklist = new RedisSessionBlocklist({ redis: new FakeRedisClient(), ttlMs: 10 });

    await blocklist.revoke('session-1');
    expect(await blocklist.isRevoked('session-1')).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(await blocklist.isRevoked('session-1')).toBe(false);
  });

  it('is coherent across two instances sharing one store (the cross-serverless-instance case this exists for)', async () => {
    const redis = new FakeRedisClient();
    const instanceA = new RedisSessionBlocklist({ redis });
    const instanceB = new RedisSessionBlocklist({ redis });

    // Logout handled by instance A...
    await instanceA.revoke('shared-session');

    // ...must be visible to the instance that serves the next request.
    expect(await instanceB.isRevoked('shared-session')).toBe(true);
  });

  describe('resilience to Redis failures', () => {
    it('fails open on isRevoked — a Redis outage must not unauthenticate every request', async () => {
      const redis = new FakeRedisClient();
      const blocklist = new RedisSessionBlocklist({ redis });
      await blocklist.revoke('session-1');
      expect(await blocklist.isRevoked('session-1')).toBe(true);

      redis.failing = true;

      expect(await blocklist.isRevoked('session-1')).toBe(false);
    });

    it('does not throw from revoke when Redis is down — the DB revocation is the source of truth', async () => {
      const redis = new FakeRedisClient();
      redis.failing = true;
      const blocklist = new RedisSessionBlocklist({ redis });

      await expect(blocklist.revoke('session-1')).resolves.toBeUndefined();
    });

    it('fails open without calling Redis at all once the circuit breaker is open', async () => {
      const redis = new FakeRedisClient();
      redis.failing = true;
      const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 60_000 });
      const blocklist = new RedisSessionBlocklist({ redis, breaker });

      // Trips the breaker.
      expect(await blocklist.isRevoked('session-1')).toBe(false);

      const getSpy = vi.spyOn(redis, 'get');
      expect(await blocklist.isRevoked('session-1')).toBe(false);
      expect(getSpy).not.toHaveBeenCalled();
    });
  });
});
