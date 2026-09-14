// Google-only for now (JEF-331) — Outlook/Microsoft support is deferred to a
// follow-up ticket rather than half-built behind an unreachable union member.
export type CalendarProvider = 'google';

export interface CalendarConnection {
  id: string;
  userId: string;
  provider: CalendarProvider;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  externalCalendarId: string;
  createdAt: Date;
}

/** The three event kinds `GetCalendarEventsUseCase` already produces — the sync surface mirrors it rather than inventing a new taxonomy. */
export type CalendarSyncSourceType = 'applied' | 'followUp' | 'interview';

/**
 * Tracks the external event a Trakwyn record was synced to, so a later
 * update/delete can find it instead of creating a duplicate every time.
 * Scoped to one connection: disconnecting a calendar means every row for it
 * is deleted along with the external events they point at.
 */
export interface CalendarSyncedEvent {
  id: string;
  calendarConnectionId: string;
  sourceType: CalendarSyncSourceType;
  sourceId: string;
  externalEventId: string;
  createdAt: Date;
  updatedAt: Date;
}
