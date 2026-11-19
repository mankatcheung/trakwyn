import { describe, it, expect, vi, afterEach } from 'vitest';
import { isSessionFresh } from '#src/use-cases/auth/sessionFreshness.js';
import { REAUTH } from '#src/use-cases/constants.js';

describe('isSessionFresh', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true when authTime is null (not applicable, e.g. API-token auth)', () => {
    expect(isSessionFresh(null)).toBe(true);
  });

  it('returns false when authTime is undefined (pre-JEF-44 JWT with no claim)', () => {
    expect(isSessionFresh(undefined)).toBe(false);
  });

  it('returns true when authTime is within the freshness window', () => {
    const now = 1_700_000_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(now);

    expect(isSessionFresh(now - REAUTH.FRESHNESS_WINDOW_MS)).toBe(true);
  });

  it('returns false when authTime is older than the freshness window', () => {
    const now = 1_700_000_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(now);

    expect(isSessionFresh(now - REAUTH.FRESHNESS_WINDOW_MS - 1)).toBe(false);
  });
});
