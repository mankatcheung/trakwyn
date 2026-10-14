import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * In-process, fixed-window rate limiter. Buckets live in memory and are
 * never persisted, so limits reset on process restart and aren't shared
 * across horizontally-scaled instances — used for local dev/tests only.
 * Production uses RedisRateLimiter (JEF-160), selected via the same
 * CACHE_PROVIDER toggle RedisCache uses.
 */
export class RateLimiter implements IRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly maxAttempts: number,
    private readonly windowMs: number,
  ) {}

  async consume(key: string): Promise<boolean> {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || now > bucket.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (bucket.count >= this.maxAttempts) return false;

    bucket.count += 1;
    return true;
  }

  async isLimited(key: string): Promise<boolean> {
    const bucket = this.buckets.get(key);
    if (!bucket || Date.now() > bucket.resetAt) return false;
    return bucket.count >= this.maxAttempts;
  }
}
