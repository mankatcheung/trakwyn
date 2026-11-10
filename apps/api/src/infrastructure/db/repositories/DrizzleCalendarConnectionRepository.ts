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
import type { ILlmApiKeyCipher } from '#src/use-cases/ports/ILlmApiKeyCipher.js';
import { getClient } from '../transactionContext.js';

type Row = typeof calendarConnection.$inferSelect;

/**
 * Binds each ciphertext to the row it belongs to (user, provider and which
 * token), so a value copied to another row fails to decrypt. See
 * `ILlmApiKeyCipher`. `userId` and `provider` never change on a row, so the
 * context is stable across the reconnect upsert.
 */
const tokenContext = (userId: string, provider: string, kind: 'access' | 'refresh') =>
  `calendar:${userId}:${provider}:${kind}`;

export class DrizzleCalendarConnectionRepository implements ICalendarConnectionRepository {
  private readonly database: DrizzleDb;
  private readonly cipher: ILlmApiKeyCipher;

  /**
   * Access and refresh tokens are sealed with the same cipher and key as
   * users' LLM API keys (`LLM_API_KEY_ENCRYPTION_KEY`): one secret to
   * manage, and never returned to a client.
   */
  constructor({ db, llmApiKeyCipher }: { db: DrizzleDb; llmApiKeyCipher: ILlmApiKeyCipher }) {
    this.database = db;
    this.cipher = llmApiKeyCipher;
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
    const [row] = await this.db
      .insert(calendarConnection)
      .values({
        ...data,
        accessToken: this.cipher.encrypt(
          data.accessToken,
          tokenContext(data.userId, data.provider, 'access'),
        ),
        refreshToken: this.cipher.encrypt(
          data.refreshToken,
          tokenContext(data.userId, data.provider, 'refresh'),
        ),
      })
      .returning();
    return this.toEntity(row);
  }

  async update(id: string, data: UpdateCalendarConnectionData): Promise<CalendarConnection> {
    const [current] = await this.db
      .select({ userId: calendarConnection.userId, provider: calendarConnection.provider })
      .from(calendarConnection)
      .where(eq(calendarConnection.id, id))
      .limit(1);
    if (!current) throw new Error(`Calendar connection ${id} not found`);

    const { accessToken, refreshToken, ...rest } = data;
    const [row] = await this.db
      .update(calendarConnection)
      .set({
        ...rest,
        ...(accessToken !== undefined && {
          accessToken: this.cipher.encrypt(
            accessToken,
            tokenContext(current.userId, current.provider, 'access'),
          ),
        }),
        ...(refreshToken !== undefined && {
          refreshToken: this.cipher.encrypt(
            refreshToken,
            tokenContext(current.userId, current.provider, 'refresh'),
          ),
        }),
      })
      .where(eq(calendarConnection.id, id))
      .returning();
    return this.toEntity(row);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(calendarConnection).where(eq(calendarConnection.id, id));
  }

  private toEntity(row: Row): CalendarConnection {
    return {
      id: row.id,
      userId: row.userId,
      provider: row.provider as CalendarProvider,
      accessToken: this.cipher.decrypt(
        row.accessToken,
        tokenContext(row.userId, row.provider, 'access'),
      ),
      refreshToken: this.cipher.decrypt(
        row.refreshToken,
        tokenContext(row.userId, row.provider, 'refresh'),
      ),
      accessTokenExpiresAt: row.accessTokenExpiresAt,
      externalCalendarId: row.externalCalendarId,
      createdAt: row.createdAt,
    };
  }
}
