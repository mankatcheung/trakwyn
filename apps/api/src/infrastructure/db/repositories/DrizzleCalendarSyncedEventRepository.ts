import { eq, and } from 'drizzle-orm';
import type { DrizzleDb, DrizzleClient } from '../client.js';
import { calendarSyncedEvent } from '../schema.js';
import type {
  CalendarSyncedEvent,
  CalendarSyncSourceType,
} from '#src/domain/calendarConnection/CalendarConnection.js';
import type {
  ICalendarSyncedEventRepository,
  UpsertCalendarSyncedEventData,
} from '#src/use-cases/ports/ICalendarSyncedEventRepository.js';
import { getClient } from '../transactionContext.js';

export class DrizzleCalendarSyncedEventRepository implements ICalendarSyncedEventRepository {
  private readonly database: DrizzleDb;

  constructor({ db }: { db: DrizzleDb }) {
    this.database = db;
  }

  private get db(): DrizzleClient {
    return getClient(this.database);
  }

  async findBySource(
    calendarConnectionId: string,
    sourceType: CalendarSyncSourceType,
    sourceId: string,
  ): Promise<CalendarSyncedEvent | null> {
    const [row] = await this.db
      .select()
      .from(calendarSyncedEvent)
      .where(
        and(
          eq(calendarSyncedEvent.calendarConnectionId, calendarConnectionId),
          eq(calendarSyncedEvent.sourceType, sourceType),
          eq(calendarSyncedEvent.sourceId, sourceId),
        ),
      )
      .limit(1);
    return row ? this.toEntity(row) : null;
  }

  async findAllByConnectionId(calendarConnectionId: string): Promise<CalendarSyncedEvent[]> {
    const rows = await this.db
      .select()
      .from(calendarSyncedEvent)
      .where(eq(calendarSyncedEvent.calendarConnectionId, calendarConnectionId));
    return rows.map((r) => this.toEntity(r));
  }

  async upsert(data: UpsertCalendarSyncedEventData): Promise<CalendarSyncedEvent> {
    const existing = await this.findBySource(
      data.calendarConnectionId,
      data.sourceType,
      data.sourceId,
    );
    if (existing) {
      const [row] = await this.db
        .update(calendarSyncedEvent)
        .set({ externalEventId: data.externalEventId })
        .where(eq(calendarSyncedEvent.id, existing.id))
        .returning();
      return this.toEntity(row);
    }
    const [row] = await this.db.insert(calendarSyncedEvent).values(data).returning();
    return this.toEntity(row);
  }

  async deleteBySource(
    calendarConnectionId: string,
    sourceType: CalendarSyncSourceType,
    sourceId: string,
  ): Promise<void> {
    await this.db
      .delete(calendarSyncedEvent)
      .where(
        and(
          eq(calendarSyncedEvent.calendarConnectionId, calendarConnectionId),
          eq(calendarSyncedEvent.sourceType, sourceType),
          eq(calendarSyncedEvent.sourceId, sourceId),
        ),
      );
  }

  async deleteAllByConnectionId(calendarConnectionId: string): Promise<void> {
    await this.db
      .delete(calendarSyncedEvent)
      .where(eq(calendarSyncedEvent.calendarConnectionId, calendarConnectionId));
  }

  private toEntity(row: typeof calendarSyncedEvent.$inferSelect): CalendarSyncedEvent {
    return {
      id: row.id,
      calendarConnectionId: row.calendarConnectionId,
      sourceType: row.sourceType as CalendarSyncSourceType,
      sourceId: row.sourceId,
      externalEventId: row.externalEventId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
