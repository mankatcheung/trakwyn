// Google-only for now (JEF-331). Outlook is JEF-543: add a member here rather
// than a new column, the table already stores the provider as text.
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

/**
 * What a synced external event mirrors. Interviews only (JEF-331 phase 1);
 * the column is text, so `applied` and `followUp` can be added later without
 * a migration.
 */
export type CalendarSyncSourceType = 'interview';

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
