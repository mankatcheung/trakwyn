import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OAuthStateService } from '#src/infrastructure/auth/OAuthStateService.js';

describe('OAuthStateService', () => {
  const originalSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
  });

  afterEach(() => {
    process.env.JWT_SECRET = originalSecret;
    vi.useRealTimers();
  });

  it('round-trips provider, mode, and userId', () => {
    const service = new OAuthStateService();
    const { state } = service.issue('google', 'link', 'user-1');

    const parsed = service.verify(state);

    expect(parsed.provider).toBe('google');
    expect(parsed.mode).toBe('link');
    expect(parsed.userId).toBe('user-1');
  });

  it('omits userId for the login mode', () => {
    const service = new OAuthStateService();
    const { state } = service.issue('github', 'login');

    const parsed = service.verify(state);

    expect(parsed.userId).toBeUndefined();
  });

  it('issues a different nonce each time, so two states for the same input differ', () => {
    const service = new OAuthStateService();
    const { state: first } = service.issue('google', 'login');
    const { state: second } = service.issue('google', 'login');

    expect(first).not.toBe(second);
  });

  it('throws on a tampered payload', () => {
    const service = new OAuthStateService();
    const { state } = service.issue('google', 'login');
    const [payload] = state.split('.');
    const tampered = `${payload}.tampered-signature`;

    expect(() => service.verify(tampered)).toThrow('Invalid OAuth state signature');
  });

  it('throws on a malformed state', () => {
    const service = new OAuthStateService();
    expect(() => service.verify('not-a-valid-state')).toThrow('Malformed OAuth state');
  });

  it('throws once the state has expired', () => {
    vi.useFakeTimers();
    const service = new OAuthStateService();
    const { state } = service.issue('google', 'login');

    vi.advanceTimersByTime(6 * 60 * 1000); // past the 5-minute TTL

    expect(() => service.verify(state)).toThrow('OAuth state expired');
  });
  it('returns the nonce that is inside the state, so it can be bound to a cookie', () => {
    const service = new OAuthStateService();

    const { state, nonce } = service.issue('google', 'login');

    expect(nonce).toBeTruthy();
    // The cookie holds this value and the callback compares it against the
    // nonce carried in the signed payload — they have to be the same thing.
    expect(service.verify(state).nonce).toBe(nonce);
  });

  it('mints a different nonce every time', () => {
    const service = new OAuthStateService();

    expect(service.issue('google', 'login').nonce).not.toBe(service.issue('google', 'login').nonce);
  });

  describe('step-up (JEF-463)', () => {
    it('carries the session a reauth state refreshes', () => {
      const service = new OAuthStateService();
      const { state } = service.issue('google', 'reauth', 'user-1', '/settings', 'session-1');

      expect(service.verify(state)).toMatchObject({
        mode: 'reauth',
        userId: 'user-1',
        sessionId: 'session-1',
        returnTo: '/settings',
      });
    });

    it('round-trips a reauth ticket', () => {
      const service = new OAuthStateService();

      expect(
        service.verifyReauthTicket(service.issueReauthTicket('user-1', 'session-1')),
      ).toMatchObject({ userId: 'user-1', sessionId: 'session-1' });
    });

    it('never reads a state as a ticket, or a ticket as a state', () => {
      const service = new OAuthStateService();
      const { state } = service.issue('google', 'reauth', 'user-1', undefined, 'session-1');
      const ticket = service.issueReauthTicket('user-1', 'session-1');

      expect(() => service.verifyReauthTicket(state)).toThrow();
      expect(() => service.verify(ticket)).toThrow();
    });

    it('refuses an expired ticket', () => {
      vi.useFakeTimers();
      const service = new OAuthStateService();
      const ticket = service.issueReauthTicket('user-1', 'session-1');

      vi.advanceTimersByTime(2 * 60 * 1000 + 1);

      expect(() => service.verifyReauthTicket(ticket)).toThrow('expired');
    });

    it('refuses a ticket signed with another secret', () => {
      const ticket = new OAuthStateService().issueReauthTicket('user-1', 'session-1');
      process.env.JWT_SECRET = 'another-secret';

      expect(() => new OAuthStateService().verifyReauthTicket(ticket)).toThrow('signature');
    });
  });
});
