import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CalendarOAuthStateService } from '#src/infrastructure/auth/CalendarOAuthStateService.js';

describe('CalendarOAuthStateService', () => {
  const originalSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
  });

  afterEach(() => {
    process.env.JWT_SECRET = originalSecret;
    vi.useRealTimers();
  });

  it('round-trips provider and userId', () => {
    const service = new CalendarOAuthStateService();
    const { state } = service.issue('google', 'user-1');

    const parsed = service.verify(state);

    expect(parsed.provider).toBe('google');
    expect(parsed.userId).toBe('user-1');
  });

  it('issues a different nonce each time', () => {
    const service = new CalendarOAuthStateService();
    const { state: first } = service.issue('google', 'user-1');
    const { state: second } = service.issue('google', 'user-1');

    expect(first).not.toBe(second);
  });

  it('throws on a tampered payload', () => {
    const service = new CalendarOAuthStateService();
    const { state } = service.issue('google', 'user-1');
    const [payload] = state.split('.');
    const tampered = `${payload}.tampered-signature`;

    expect(() => service.verify(tampered)).toThrow('Invalid calendar OAuth state signature');
  });

  it('throws on a malformed state', () => {
    const service = new CalendarOAuthStateService();
    expect(() => service.verify('not-a-valid-state')).toThrow('Malformed calendar OAuth state');
  });

  it('throws once the state has expired', () => {
    vi.useFakeTimers();
    const service = new CalendarOAuthStateService();
    const { state } = service.issue('google', 'user-1');

    vi.advanceTimersByTime(6 * 60 * 1000); // past the 5-minute TTL

    expect(() => service.verify(state)).toThrow('Calendar OAuth state expired');
  });

  it('returns the nonce that is inside the state, so it can be bound to a cookie', () => {
    const service = new CalendarOAuthStateService();

    const { state, nonce } = service.issue('google', 'user-1');

    expect(nonce).toBeTruthy();
    expect(service.verify(state).nonce).toBe(nonce);
  });
});
