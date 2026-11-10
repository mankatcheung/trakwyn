import type { CalendarSyncSourceType } from '#src/domain/calendarConnection/CalendarConnection.js';
import type { CalendarEventData } from '#src/use-cases/ports/ICalendarProvider.js';

export interface SyncCalendarEventInput {
  userId: string;
  sourceType: CalendarSyncSourceType;
  sourceId: string;
  /** null means the source was deleted (or its date cleared) — the synced event, if any, is removed. */
  event: CalendarEventData | null;
}

export interface RemoveCalendarEventsInput {
  userId: string;
  sourceType: CalendarSyncSourceType;
  sourceIds: string[];
}

export interface ISyncCalendarEventUseCase {
  /** Creates, updates or (when `event` is null) removes one synced event on every connected calendar. Never throws. */
  execute(input: SyncCalendarEventInput): Promise<void>;
  /**
   * Removes the synced events of sources that no longer exist, for example
   * the interview rounds of a permanently deleted application. Never throws.
   */
  removeMany(input: RemoveCalendarEventsInput): Promise<void>;
}
