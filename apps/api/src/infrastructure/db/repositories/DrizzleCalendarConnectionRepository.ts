import { eq, and } from 'drizzle-orm';
import type { DrizzleDb, DrizzleClient } from '../client.js';
import { calendarConnection } from '../schema.js';
import type {
  CalendarConnection,
  CalendarProvider,
} from '#src/domain/calendarConnection/CalendarConnection.js';
import type {
  CreateCalendarConnectionData,
  ICalendarConnectionRepository,
  UpdateCalendarConnectionData,
} from '#src/use-cases/ports/ICalendarConnectionRepository.js';
import { getClient } from '../transactionContext.js';

export class DrizzleCalendarConnectionRepository implements ICalendarConnectionRepository {
  private readonly database: DrizzleDb;

  constructor({ db }: { db: DrizzleDb }) {
    this.database = db;
  }

  private get db(): DrizzleClient {
    return getClient(this.database);
  }

  async findAllByUserId(userId: string): Promise<CalendarConnection[]> {
    const rows = await this.db
      .select()
      .from(calendarConnection)
      .where(eq(calendarConnection.userId, userId));
    return rows.map((r) => this.toEntity(r));
  }

  async findByUserIdAndProvider(
    userId: string,
    provider: CalendarProvider,
  ): Promise<CalendarConnection | null> {
    const [row] = await this.db
      .select()
      .from(calendarConnection)
      .where(and(eq(calendarConnection.userId, userId), eq(calendarConnection.provider, provider)))
      .limit(1);
    return row ? this.toEntity(row) : null;
  }

  async findById(id: string): Promise<CalendarConnection | null> {
    const [row] = await this.db
      .select()
      .from(calendarConnection)
      .where(eq(calendarConnection.id, id))
      .limit(1);
    return row ? this.toEntity(row) : null;
  }

  async create(data: CreateCalendarConnectionData): Promise<CalendarConnection> {
    const existing = await this.findByUserIdAndProvider(data.userId, data.provider);
    if (existing) {
      return this.update(existing.id, {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        accessTokenExpiresAt: data.accessTokenExpiresAt,
      });
    }
    const [row] = await this.db.insert(calendarConnection).values(data).returning();
    return this.toEntity(row);
  }

  async update(id: string, data: UpdateCalendarConnectionData): Promise<CalendarConnection> {
    const [row] = await this.db
      .update(calendarConnection)
      .set(data)
      .where(eq(calendarConnection.id, id))
      .returning();
    return this.toEntity(row);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(calendarConnection).where(eq(calendarConnection.id, id));
  }

  private toEntity(row: typeof calendarConnection.$inferSelect): CalendarConnection {
    return {
      id: row.id,
      userId: row.userId,
      provider: row.provider as CalendarProvider,
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      accessTokenExpiresAt: row.accessTokenExpiresAt,
      externalCalendarId: row.externalCalendarId,
      createdAt: row.createdAt,
    };
  }
}
