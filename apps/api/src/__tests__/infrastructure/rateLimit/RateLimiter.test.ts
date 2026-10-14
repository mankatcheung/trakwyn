import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RateLimiter } from '#src/infrastructure/rateLimit/RateLimiter.js';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests up to the configured maximum within the window', async () => {
    const limiter = new RateLimiter(3, 60_000);

    expect(await limiter.consume('key-1')).toBe(true);
    expect(await limiter.consume('key-1')).toBe(true);
    expect(await limiter.consume('key-1')).toBe(true);
  });

  it('rejects requests once the maximum is exceeded within the window', async () => {
    const limiter = new RateLimiter(2, 60_000);

    expect(await limiter.consume('key-1')).toBe(true);
    expect(await limiter.consume('key-1')).toBe(true);
    expect(await limiter.consume('key-1')).toBe(false);
  });

  it('tracks separate keys independently', async () => {
    const limiter = new RateLimiter(1, 60_000);

    expect(await limiter.consume('key-1')).toBe(true);
    expect(await limiter.consume('key-2')).toBe(true);
    expect(await limiter.consume('key-1')).toBe(false);
    expect(await limiter.consume('key-2')).toBe(false);
  });

  it('resets the count once the window has elapsed', async () => {
    const limiter = new RateLimiter(1, 60_000);

    expect(await limiter.consume('key-1')).toBe(true);
    expect(await limiter.consume('key-1')).toBe(false);

    vi.advanceTimersByTime(60_001);

    expect(await limiter.consume('key-1')).toBe(true);
  });
  describe('isLimited', () => {
    it('is false for a key that has not been consumed', async () => {
      const limiter = new RateLimiter(2, 60_000);

      expect(await limiter.isLimited('key-1')).toBe(false);
    });

    it('turns true once the maximum has been consumed, without spending an attempt itself', async () => {
      const limiter = new RateLimiter(2, 60_000);

      await limiter.consume('key-1');
      expect(await limiter.isLimited('key-1')).toBe(false);
      expect(await limiter.isLimited('key-1')).toBe(false);
      await limiter.consume('key-1');
      expect(await limiter.isLimited('key-1')).toBe(true);
      expect(await limiter.isLimited('key-2')).toBe(false);
    });

    it('is false again once the window has elapsed', async () => {
      const limiter = new RateLimiter(1, 60_000);
      await limiter.consume('key-1');

      vi.advanceTimersByTime(60_001);

      expect(await limiter.isLimited('key-1')).toBe(false);
    });
  });
});
