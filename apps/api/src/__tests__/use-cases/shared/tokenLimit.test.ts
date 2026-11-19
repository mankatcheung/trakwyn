import { describe, it, expect } from 'vitest';
import { isLimitReached, startOfUtcMonth } from '#src/use-cases/shared/tokenLimit.js';

describe('startOfUtcMonth', () => {
  it('returns midnight on the 1st, UTC', () => {
    expect(startOfUtcMonth(new Date('2026-03-15T12:34:56.789Z'))).toEqual(
      new Date('2026-03-01T00:00:00.000Z'),
    );
  });

  it('is idempotent on a value already at the boundary', () => {
    const boundary = new Date('2026-03-01T00:00:00.000Z');

    expect(startOfUtcMonth(boundary)).toEqual(boundary);
  });

  /**
   * A local-time implementation would land on 28 Feb for this instant east
   * of UTC, quietly counting a day of the previous month's usage.
   */
  it('uses UTC, not the host timezone', () => {
    expect(startOfUtcMonth(new Date('2026-03-01T00:30:00.000Z'))).toEqual(
      new Date('2026-03-01T00:00:00.000Z'),
    );
  });
});

describe('isLimitReached', () => {
  it('is false when no limit is set', () => {
    expect(isLimitReached(999_999_999, null)).toBe(false);
  });

  it('is false below the limit', () => {
    expect(isLimitReached(199, 200)).toBe(false);
  });

  /** The limit is the stop-line: reaching it exactly pauses the key. */
  it('is true exactly at the limit', () => {
    expect(isLimitReached(200, 200)).toBe(true);
  });

  it('is true above the limit, which a single turn can overshoot to', () => {
    expect(isLimitReached(4_000, 200)).toBe(true);
  });

  it('is false at zero usage', () => {
    expect(isLimitReached(0, 200)).toBe(false);
  });
});
