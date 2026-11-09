import { describe, it, expect } from 'vitest';
import { FakeGoogleCalendarProvider } from '#src/infrastructure/calendar/FakeCalendarProvider.js';
import { ROUTES } from '#src/http/constants.js';

describe('FakeCalendarProvider', () => {
  describe('getAuthorizationUrl', () => {
    it('points at the fake consent route, carrying the provider name and state', () => {
      const url = new FakeGoogleCalendarProvider().getAuthorizationUrl(
        'my-state',
        'https://api/cb',
        'my-challenge',
      );
      const parsed = new URL(url, 'http://localhost');

      expect(parsed.pathname).toBe(ROUTES.CALENDAR_OAUTH_FAKE_CONSENT);
      expect(parsed.searchParams.get('provider')).toBe('google');
      expect(parsed.searchParams.get('state')).toBe('my-state');
    });
  });

  describe('exchangeCodeForTokens', () => {
    it('decodes the token bundle the consent route encoded into the code, without any network call', async () => {
      const bundle = { accessToken: 'fake-access-1', refreshToken: 'fake-refresh-1' };
      const code = Buffer.from(JSON.stringify(bundle), 'utf8').toString('base64url');

      const result = await new FakeGoogleCalendarProvider().exchangeCodeForTokens(
        code,
        'https://api/cb',
        'verifier-unused-by-the-fake',
      );

      expect(result.accessToken).toBe('fake-access-1');
      expect(result.refreshToken).toBe('fake-refresh-1');
      expect(result.externalCalendarId).toBe('primary');
      expect(result.accessTokenExpiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('event CRUD', () => {
    it('fabricates an external event id without any network call', async () => {
      const provider = new FakeGoogleCalendarProvider();
      const { externalEventId } = await provider.createEvent('token', 'primary', {
        title: 'Interview',
        description: null,
        startAt: new Date(),
        endAt: new Date(),
      });

      expect(externalEventId).toMatch(/^fake-event-/);
    });

    it('updateEvent and deleteEvent resolve without throwing', async () => {
      const provider = new FakeGoogleCalendarProvider();
      await expect(
        provider.updateEvent('token', 'primary', 'fake-event-1', {
          title: 'Interview',
          description: null,
          startAt: new Date(),
          endAt: new Date(),
        }),
      ).resolves.toBeUndefined();
      await expect(
        provider.deleteEvent('token', 'primary', 'fake-event-1'),
      ).resolves.toBeUndefined();
    });
  });
});
