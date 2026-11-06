import { describe, it, expect, vi } from 'vitest';
import { RedisCache } from '#src/infrastructure/cache/RedisCache.js';
import { CircuitBreaker } from '#src/infrastructure/resilience/CircuitBreaker.js';
import type { IRedisClient } from '#src/infrastructure/cache/IRedisClient.js';

function matchesGlob(key: string, pattern: string): boolean {
  return pattern.endsWith('*') ? key.startsWith(pattern.slice(0, -1)) : key === pattern;
}

/**
 * In-memory stand-in for @upstash/redis's Redis client, faithful enough to
 * real SET NX/PX and SCAN semantics to exercise RedisCache's real logic
 * (including the stampede lock and SCAN pagination) without a network call.
 *
 * set() round-trips every value through JSON, same as the real client
 * serializing over its REST API — a naive by-reference store would hide
 * exactly the class of bug this is meant to catch (JEF-157: a cached Date
 * silently becoming a string, with nothing here to revive it).
 */
class FakeRedisClient implements IRedisClient {
  private readonly store = new Map<string, { value: unknown; expiresAt: number | null }>();

  /** When true, every method rejects instead of touching the store — simulates Redis being unreachable. */
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
    const serialized = JSON.parse(JSON.stringify(value)) as unknown;
    this.store.set(key, { value: serialized, expiresAt: opts?.px ? Date.now() + opts.px : null });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    this.checkFailing();
    let count = 0;
    for (const key of keys) if (this.store.delete(key)) count++;
    return count;
  }

  async incr(key: string): Promise<number> {
    this.checkFailing();
    // Real INCR on a fresh key creates it with no TTL; on an existing key it
    // leaves the TTL untouched.
    const entry = this.isLive(key) ? this.store.get(key)! : undefined;
    const next = (typeof entry?.value === 'number' ? entry.value : 0) + 1;
    this.store.set(key, { value: next, expiresAt: entry?.expiresAt ?? null });
    return next;
  }

  async scan(
    cursor: string | number,
    opts?: { match?: string; count?: number },
  ): Promise<[string, string[]]> {
    this.checkFailing();
    // Resume strictly after the last key name returned, rather than an
    // array index — matches real Redis SCAN's guarantee that keys already
    // visited (and possibly deleted by the caller) don't shift what's still
    // to come. An index-based cursor would skip entries once deletes shrink
    // the live set mid-scan.
    const live = [...this.store.keys()].filter((k) => this.isLive(k)).sort();
    const matched = opts?.match ? live.filter((k) => matchesGlob(k, opts.match!)) : live;
    const after = cursor === '0' || cursor === 0 ? matched : matched.filter((k) => k > cursor);
    const pageSize = opts?.count ?? after.length;
    const page = after.slice(0, pageSize);
    const next = page.length < after.length ? page[page.length - 1]! : '0';
    return [next, page];
  }
}

function makeCache(
  overrides: Partial<{
    lockTtlMs: number;
    pollIntervalMs: number;
    maxPollAttempts: number;
    breaker: CircuitBreaker;
  }> = {},
) {
  const redis = new FakeRedisClient();
  // A high threshold by default so the tests below that aren't specifically
  // about the breaker don't need to worry about tripping it.
  const breaker = overrides.breaker ?? new CircuitBreaker({ failureThreshold: 1000 });
  const cache = new RedisCache({ redis, ...overrides, breaker });
  return { cache, redis, breaker };
}

describe('RedisCache', () => {
  describe('getOrSet', () => {
    it('calls fetch and caches the result on a miss', async () => {
      const { cache } = makeCache();
      const fetch = vi.fn().mockResolvedValue('value');
      const result = await cache.getOrSet('key', fetch);
      expect(result).toBe('value');
      expect(fetch).toHaveBeenCalledOnce();
    });

    it('returns the cached value on a second call without calling fetch again', async () => {
      const { cache } = makeCache();
      const fetch = vi.fn().mockResolvedValue('value');
      await cache.getOrSet('key', fetch);
      const result = await cache.getOrSet('key', fetch);
      expect(result).toBe('value');
      expect(fetch).toHaveBeenCalledOnce();
    });

    it('revives Date fields back into real Date instances on a cache hit', async () => {
      const { cache } = makeCache();
      const scheduledAt = new Date('2026-09-01T10:00:00.000Z');
      const fetch = vi.fn(async () => ({
        id: 'round-1',
        scheduledAt,
        nested: { at: scheduledAt },
      }));

      await cache.getOrSet('key', fetch); // populates the cache (goes through fetch, not a hit)
      const hit = await cache.getOrSet('key', fetch); // served from the cache — this is the code path under test

      expect(hit.scheduledAt).toBeInstanceOf(Date);
      expect(hit.scheduledAt.getTime()).toBe(scheduledAt.getTime());
      expect(hit.nested.at).toBeInstanceOf(Date);
      expect(fetch).toHaveBeenCalledOnce();
    });

    it('caches a null result as a valid value, distinct from a miss', async () => {
      const { cache } = makeCache();
      const fetch = vi.fn().mockResolvedValue(null);
      const first = await cache.getOrSet('nullable', fetch);
      const second = await cache.getOrSet('nullable', fetch);
      expect(first).toBeNull();
      expect(second).toBeNull();
      expect(fetch).toHaveBeenCalledOnce();
    });

    it('expires and re-fetches after ttlMs elapses', async () => {
      const { cache } = makeCache();
      const fetch = vi.fn().mockResolvedValue('value');
      await cache.getOrSet('key', fetch, 10);
      await new Promise((resolve) => setTimeout(resolve, 20));
      await cache.getOrSet('key', fetch, 10);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('stampede: only the lock-winner calls fetch, the other waits for its result', async () => {
      const { cache } = makeCache({ pollIntervalMs: 5, maxPollAttempts: 50 });
      let resolveFetch!: (value: string) => void;
      const fetch = vi.fn(
        () =>
          new Promise<string>((resolve) => {
            resolveFetch = resolve;
          }),
      );

      const first = cache.getOrSet('key', fetch);
      // Give the first call's lock-acquire a tick to land before starting the second.
      await new Promise((resolve) => setTimeout(resolve, 1));
      const second = cache.getOrSet('key', vi.fn());

      resolveFetch('value');
      const [firstResult, secondResult] = await Promise.all([first, second]);

      expect(firstResult).toBe('value');
      expect(secondResult).toBe('value');
      expect(fetch).toHaveBeenCalledOnce();
    });

    it('falls back to fetching directly if the lock-holder never finishes in time', async () => {
      const { cache, redis } = makeCache({ pollIntervalMs: 2, maxPollAttempts: 3 });
      // Simulate another process holding the lock without ever populating the key.
      await redis.set('lock:key', '1', { nx: true, px: 10_000 });

      const fetch = vi.fn().mockResolvedValue('fallback-value');
      const result = await cache.getOrSet('key', fetch);

      expect(result).toBe('fallback-value');
      expect(fetch).toHaveBeenCalledOnce();
    });
  });

  describe('delete', () => {
    it('removes a specific key', async () => {
      const { cache } = makeCache();
      const fetchA = vi.fn().mockResolvedValue(1);
      const fetchB = vi.fn().mockResolvedValue(2);
      await cache.getOrSet('a', fetchA);
      await cache.getOrSet('b', fetchB);

      await cache.delete('a');

      await cache.getOrSet('a', fetchA);
      await cache.getOrSet('b', fetchB);
      expect(fetchA).toHaveBeenCalledTimes(2);
      expect(fetchB).toHaveBeenCalledOnce();
    });
  });

  describe('deleteByPrefix', () => {
    it('deletes only keys matching the prefix', async () => {
      const { cache } = makeCache();
      const fetchUser1 = vi.fn().mockResolvedValue('list1');
      const fetchUser2 = vi.fn().mockResolvedValue('list2');
      const fetchById = vi.fn().mockResolvedValue('single');
      await cache.getOrSet('apps:list:user1:', fetchUser1);
      await cache.getOrSet('apps:list:user2:', fetchUser2);
      await cache.getOrSet('apps:byId:abc', fetchById);

      await cache.deleteByPrefix('apps:list:user1:');

      await cache.getOrSet('apps:list:user1:', fetchUser1);
      await cache.getOrSet('apps:list:user2:', fetchUser2);
      await cache.getOrSet('apps:byId:abc', fetchById);
      expect(fetchUser1).toHaveBeenCalledTimes(2);
      expect(fetchUser2).toHaveBeenCalledOnce();
      expect(fetchById).toHaveBeenCalledOnce();
    });

    it('pages through SCAN across more than one 100-key batch', async () => {
      const { cache, redis } = makeCache();
      for (let i = 0; i < 250; i++) {
        await redis.set(`apps:list:user1:${i}`, i);
      }
      await redis.set('apps:byId:keep', 'keep');

      await cache.deleteByPrefix('apps:list:user1:');

      const remaining = await redis.scan('0', { count: 1000 });
      expect(remaining[1]).toEqual(['apps:byId:keep']);
    });
  });

  describe('resilience to Redis failures (JEF-159)', () => {
    it('getOrSet falls back to fetch directly when Redis errors, instead of throwing', async () => {
      const { cache, redis } = makeCache();
      redis.failing = true;
      const fetch = vi.fn().mockResolvedValue('fallback-value');

      const result = await cache.getOrSet('key', fetch);

      expect(result).toBe('fallback-value');
      expect(fetch).toHaveBeenCalledOnce();
    });

    it('delete swallows Redis errors instead of throwing', async () => {
      const { cache, redis } = makeCache();
      redis.failing = true;

      await expect(cache.delete('key')).resolves.toBeUndefined();
    });

    it('deleteByPrefix swallows Redis errors instead of throwing', async () => {
      const { cache, redis } = makeCache();
      redis.failing = true;

      await expect(cache.deleteByPrefix('apps:list:')).resolves.toBeUndefined();
    });

    it('opens the circuit after repeated failures and stops calling Redis at all', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 60_000 });
      const { cache, redis } = makeCache({ breaker });
      redis.failing = true;

      // First call: hits Redis, fails, trips the breaker open.
      await cache.getOrSet('key', () => Promise.resolve('a'));

      const getSpy = vi.spyOn(redis, 'get');
      const fetch = vi.fn().mockResolvedValue('b');
      const result = await cache.getOrSet('key', fetch);

      expect(result).toBe('b');
      expect(fetch).toHaveBeenCalledOnce();
      expect(getSpy).not.toHaveBeenCalled(); // short-circuited before ever touching Redis
    });
  });
});
