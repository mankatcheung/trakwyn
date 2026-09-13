import { randomBytes } from 'crypto';
import type {
  CalendarEventData,
  CalendarTokens,
  ICalendarProvider,
  RefreshedCalendarTokens,
} from '#src/use-cases/ports/ICalendarProvider.js';
import type { CalendarProvider } from '#src/domain/calendarConnection/CalendarConnection.js';
import { FAKE_CALENDAR, CALENDAR_OAUTH } from '#src/infrastructure/config/constants.js';

/**
 * A same-origin stand-in for Google/Microsoft Calendar, selected by
 * `CALENDAR_PROVIDER_MODE=fake` (mirrors `FakeOAuthProvider` and
 * `OAUTH_PROVIDER_MODE=fake` — see that class for the full rationale). No
 * real Google/Microsoft app is registered yet (JEF-331 decision), so this is
 * the only calendar provider exercised in dev/CI; `GoogleCalendarProvider`/
 * `MicrosoftCalendarProvider` exist ready for when real credentials land.
 *
 * `exchangeCodeForTokens` decodes the token bundle the fake consent route
 * encoded into the code itself, same trick as `FakeOAuthProvider`. Event
 * CRUD never calls a network — it fabricates a deterministic-looking id so
 * `CalendarSyncedEvent` rows behave exactly like the real thing from the
 * rest of the app's point of view.
 */
abstract class FakeCalendarProvider implements ICalendarProvider {
  protected abstract readonly provider: CalendarProvider;

  getAuthorizationUrl(state: string, _redirectUri: string, _codeChallenge: string): string {
    const params = new URLSearchParams({ provider: this.provider, state });
    return `${FAKE_CALENDAR.CONSENT_PATH}?${params.toString()}`;
  }

  async exchangeCodeForTokens(
    code: string,
    _redirectUri: string,
    _codeVerifier: string,
  ): Promise<CalendarTokens> {
    const decoded = JSON.parse(Buffer.from(code, 'base64url').toString('utf8')) as {
      accessToken: string;
      refreshToken: string;
    };
    return {
      accessToken: decoded.accessToken,
      refreshToken: decoded.refreshToken,
      // Far in the future: the fake flow never needs a refresh, so exercising
      // that path is left to the use-case unit tests with mocked providers.
      accessTokenExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      externalCalendarId: CALENDAR_OAUTH.PRIMARY_CALENDAR_ID,
    };
  }

  async refreshAccessToken(_refreshToken: string): Promise<RefreshedCalendarTokens> {
    return {
      accessToken: `fake-access-${randomBytes(8).toString('hex')}`,
      accessTokenExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    };
  }

  async createEvent(
    _accessToken: string,
    _calendarId: string,
    _event: CalendarEventData,
  ): Promise<{ externalEventId: string }> {
    return { externalEventId: `fake-event-${randomBytes(8).toString('hex')}` };
  }

  async updateEvent(
    _accessToken: string,
    _calendarId: string,
    _externalEventId: string,
    _event: CalendarEventData,
  ): Promise<void> {
    // No backing store to update — same-origin stand-in, no live dependency.
  }

  async deleteEvent(
    _accessToken: string,
    _calendarId: string,
    _externalEventId: string,
  ): Promise<void> {
    // No backing store to delete from.
  }
}

export class FakeGoogleCalendarProvider extends FakeCalendarProvider {
  protected readonly provider: CalendarProvider = 'google';
}

export class FakeMicrosoftCalendarProvider extends FakeCalendarProvider {
  protected readonly provider: CalendarProvider = 'microsoft';
}
