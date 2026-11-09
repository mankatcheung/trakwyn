import type {
  CalendarEventData,
  CalendarTokens,
  ICalendarProvider,
  RefreshedCalendarTokens,
} from '#src/use-cases/ports/ICalendarProvider.js';
import { ENV, CALENDAR_OAUTH } from '#src/infrastructure/config/constants.js';

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

interface GoogleEventResponse {
  id: string;
}

/** Local wall-clock ISO string with no zone suffix — the shape Google/Graph both expect alongside an explicit `timeZone`. */
function toLocalIso(date: Date): string {
  return date.toISOString().replace('Z', '');
}

export class GoogleCalendarProvider implements ICalendarProvider {
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor() {
    this.clientId = process.env[ENV.GOOGLE_CALENDAR_CLIENT_ID] ?? '';
    this.clientSecret = process.env[ENV.GOOGLE_CALENDAR_CLIENT_SECRET] ?? '';
  }

  getAuthorizationUrl(state: string, redirectUri: string, codeChallenge: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: CALENDAR_OAUTH.GOOGLE_SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    return `${CALENDAR_OAUTH.GOOGLE_AUTHORIZATION_URL}?${params.toString()}`;
  }

  async exchangeCodeForTokens(
    code: string,
    redirectUri: string,
    codeVerifier: string,
  ): Promise<CalendarTokens> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error(
        `${ENV.GOOGLE_CALENDAR_CLIENT_ID}/${ENV.GOOGLE_CALENDAR_CLIENT_SECRET} not set`,
      );
    }
    const response = await fetch(CALENDAR_OAUTH.GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });
    if (!response.ok) {
      throw new Error(`Google Calendar token exchange failed: ${response.status}`);
    }
    const body = (await response.json()) as GoogleTokenResponse;
    if (!body.refresh_token) {
      // Google only returns one on the first consent (access_type=offline,
      // prompt=consent forces this) — surfaced loudly rather than silently
      // storing an empty string a later refresh would then fail on.
      throw new Error('Google did not return a refresh token — reconnect with fresh consent');
    }
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      accessTokenExpiresAt: new Date(Date.now() + body.expires_in * 1000),
      externalCalendarId: CALENDAR_OAUTH.PRIMARY_CALENDAR_ID,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<RefreshedCalendarTokens> {
    const response = await fetch(CALENDAR_OAUTH.GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!response.ok) {
      throw new Error(`Google Calendar token refresh failed: ${response.status}`);
    }
    const body = (await response.json()) as GoogleTokenResponse;
    return {
      accessToken: body.access_token,
      accessTokenExpiresAt: new Date(Date.now() + body.expires_in * 1000),
    };
  }

  async createEvent(
    accessToken: string,
    calendarId: string,
    event: CalendarEventData,
  ): Promise<{ externalEventId: string }> {
    const response = await fetch(this.eventsUrl(calendarId), {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(this.toGoogleEvent(event)),
    });
    if (!response.ok) {
      throw new Error(`Google Calendar event creation failed: ${response.status}`);
    }
    const body = (await response.json()) as GoogleEventResponse;
    return { externalEventId: body.id };
  }

  async updateEvent(
    accessToken: string,
    calendarId: string,
    externalEventId: string,
    event: CalendarEventData,
  ): Promise<void> {
    const response = await fetch(`${this.eventsUrl(calendarId)}/${externalEventId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(this.toGoogleEvent(event)),
    });
    if (!response.ok) {
      throw new Error(`Google Calendar event update failed: ${response.status}`);
    }
  }

  async deleteEvent(
    accessToken: string,
    calendarId: string,
    externalEventId: string,
  ): Promise<void> {
    const response = await fetch(`${this.eventsUrl(calendarId)}/${externalEventId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    // 410 Gone: already deleted on the provider's side — not a failure from our side.
    if (!response.ok && response.status !== 404 && response.status !== 410) {
      throw new Error(`Google Calendar event deletion failed: ${response.status}`);
    }
  }

  private eventsUrl(calendarId: string): string {
    return CALENDAR_OAUTH.GOOGLE_EVENTS_URL.replace('primary', encodeURIComponent(calendarId));
  }

  private toGoogleEvent(event: CalendarEventData): Record<string, unknown> {
    return {
      summary: event.title,
      description: event.description ?? undefined,
      start: { dateTime: toLocalIso(event.startAt), timeZone: 'UTC' },
      end: { dateTime: toLocalIso(event.endAt), timeZone: 'UTC' },
    };
  }
}
