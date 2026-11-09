import type {
  CalendarSyncedEvent,
  CalendarSyncSourceType,
} from '#src/domain/calendarConnection/CalendarConnection.js';

export interface UpsertCalendarSyncedEventData {
  id: string;
  calendarConnectionId: string;
  sourceType: CalendarSyncSourceType;
  sourceId: string;
  externalEventId: string;
}

export interface ICalendarSyncedEventRepository {
  findBySource(
    calendarConnectionId: string,
    sourceType: CalendarSyncSourceType,
    sourceId: string,
  ): Promise<CalendarSyncedEvent | null>;
  findAllByConnectionId(calendarConnectionId: string): Promise<CalendarSyncedEvent[]>;
  /** Creates the row if none exists for (calendarConnectionId, sourceType, sourceId), otherwise updates its externalEventId. */
  upsert(data: UpsertCalendarSyncedEventData): Promise<CalendarSyncedEvent>;
  deleteBySource(
    calendarConnectionId: string,
    sourceType: CalendarSyncSourceType,
    sourceId: string,
  ): Promise<void>;
  deleteAllByConnectionId(calendarConnectionId: string): Promise<void>;
}
