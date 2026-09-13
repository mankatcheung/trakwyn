import type {
  CalendarEventData,
  CalendarTokens,
  ICalendarProvider,
  RefreshedCalendarTokens,
} from '#src/use-cases/ports/ICalendarProvider.js';
import { ENV, CALENDAR_OAUTH } from '#src/infrastructure/config/constants.js';

interface MicrosoftTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

interface MicrosoftEventResponse {
  id: string;
}

function toLocalIso(date: Date): string {
  return date.toISOString().replace('Z', '');
}

export class MicrosoftCalendarProvider implements ICalendarProvider {
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor() {
    this.clientId = process.env[ENV.MICROSOFT_CALENDAR_CLIENT_ID] ?? '';
    this.clientSecret = process.env[ENV.MICROSOFT_CALENDAR_CLIENT_SECRET] ?? '';
  }

  getAuthorizationUrl(state: string, redirectUri: string, codeChallenge: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      response_mode: 'query',
      scope: CALENDAR_OAUTH.MICROSOFT_SCOPE,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    return `${CALENDAR_OAUTH.MICROSOFT_AUTHORIZATION_URL}?${params.toString()}`;
  }

  async exchangeCodeForTokens(
    code: string,
    redirectUri: string,
    codeVerifier: string,
  ): Promise<CalendarTokens> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error(
        `${ENV.MICROSOFT_CALENDAR_CLIENT_ID}/${ENV.MICROSOFT_CALENDAR_CLIENT_SECRET} not set`,
      );
    }
    const response = await fetch(CALENDAR_OAUTH.MICROSOFT_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
        scope: CALENDAR_OAUTH.MICROSOFT_SCOPE,
      }),
    });
    if (!response.ok) {
      throw new Error(`Microsoft Calendar token exchange failed: ${response.status}`);
    }
    const body = (await response.json()) as MicrosoftTokenResponse;
    if (!body.refresh_token) {
      throw new Error('Microsoft did not return a refresh token — reconnect with fresh consent');
    }
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      accessTokenExpiresAt: new Date(Date.now() + body.expires_in * 1000),
      externalCalendarId: CALENDAR_OAUTH.PRIMARY_CALENDAR_ID,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<RefreshedCalendarTokens> {
    const response = await fetch(CALENDAR_OAUTH.MICROSOFT_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: CALENDAR_OAUTH.MICROSOFT_SCOPE,
      }),
    });
    if (!response.ok) {
      throw new Error(`Microsoft Calendar token refresh failed: ${response.status}`);
    }
    const body = (await response.json()) as MicrosoftTokenResponse;
    return {
      accessToken: body.access_token,
      accessTokenExpiresAt: new Date(Date.now() + body.expires_in * 1000),
    };
  }

  async createEvent(
    accessToken: string,
    _calendarId: string,
    event: CalendarEventData,
  ): Promise<{ externalEventId: string }> {
    const response = await fetch(CALENDAR_OAUTH.MICROSOFT_EVENTS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(this.toGraphEvent(event)),
    });
    if (!response.ok) {
      throw new Error(`Microsoft Calendar event creation failed: ${response.status}`);
    }
    const body = (await response.json()) as MicrosoftEventResponse;
    return { externalEventId: body.id };
  }

  async updateEvent(
    accessToken: string,
    _calendarId: string,
    externalEventId: string,
    event: CalendarEventData,
  ): Promise<void> {
    const response = await fetch(`${CALENDAR_OAUTH.MICROSOFT_EVENTS_URL}/${externalEventId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(this.toGraphEvent(event)),
    });
    if (!response.ok) {
      throw new Error(`Microsoft Calendar event update failed: ${response.status}`);
    }
  }

  async deleteEvent(
    accessToken: string,
    _calendarId: string,
    externalEventId: string,
  ): Promise<void> {
    const response = await fetch(`${CALENDAR_OAUTH.MICROSOFT_EVENTS_URL}/${externalEventId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`Microsoft Calendar event deletion failed: ${response.status}`);
    }
  }

  private toGraphEvent(event: CalendarEventData): Record<string, unknown> {
    return {
      subject: event.title,
      body: { contentType: 'text', content: event.description ?? '' },
      start: { dateTime: toLocalIso(event.startAt), timeZone: 'UTC' },
      end: { dateTime: toLocalIso(event.endAt), timeZone: 'UTC' },
    };
  }
}
