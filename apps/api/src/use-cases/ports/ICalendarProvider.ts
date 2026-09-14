export interface CalendarTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  /** The calendar to write events to — the user's primary calendar. */
  externalCalendarId: string;
}

export interface RefreshedCalendarTokens {
  accessToken: string;
  accessTokenExpiresAt: Date;
}

export interface CalendarEventData {
  title: string;
  description: string | null;
  startAt: Date;
  endAt: Date;
}

/**
 * One provider's OAuth (connect) and Calendar (event CRUD) surface, combined:
 * unlike login's `IOAuthProvider`, a calendar connection needs to keep a live
 * token pair to make API calls long after the initial redirect, so identity
 * and event access travel together here rather than being split the way
 * `IOAuthProvider`/`IOAuthAccountRepository` are for login.
 */
export interface ICalendarProvider {
  getAuthorizationUrl(state: string, redirectUri: string, codeChallenge: string): string;
  exchangeCodeForTokens(
    code: string,
    redirectUri: string,
    codeVerifier: string,
  ): Promise<CalendarTokens>;
  refreshAccessToken(refreshToken: string): Promise<RefreshedCalendarTokens>;
  createEvent(
    accessToken: string,
    calendarId: string,
    event: CalendarEventData,
  ): Promise<{ externalEventId: string }>;
  updateEvent(
    accessToken: string,
    calendarId: string,
    externalEventId: string,
    event: CalendarEventData,
  ): Promise<void>;
  deleteEvent(accessToken: string, calendarId: string, externalEventId: string): Promise<void>;
}
