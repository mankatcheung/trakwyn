import type { CalendarSyncSourceType } from '#src/domain/calendarConnection/CalendarConnection.js';
import type { CalendarEventData } from '#src/use-cases/ports/ICalendarProvider.js';

export interface SyncCalendarEventInput {
  userId: string;
  sourceType: CalendarSyncSourceType;
  sourceId: string;
  /** null means the source was deleted (or its date cleared) — the synced event, if any, is removed. */
  event: CalendarEventData | null;
}

export interface ISyncCalendarEventUseCase {
  execute(input: SyncCalendarEventInput): Promise<void>;
}
