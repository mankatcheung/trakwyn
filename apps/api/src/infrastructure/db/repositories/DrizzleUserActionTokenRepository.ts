import { and, eq, gt, isNull } from 'drizzle-orm';
import type { DrizzleDb, DrizzleClient } from '../client.js';
import { userActionToken } from '../schema.js';
import type {
  UserActionToken,
  UserActionTokenPurpose,
} from '#src/domain/userActionToken/UserActionToken.js';
import type {
  IUserActionTokenRepository,
  IssueUserActionTokenData,
} from '#src/use-cases/ports/IUserActionTokenRepository.js';
import { getClient } from '../transactionContext.js';

export class DrizzleUserActionTokenRepository implements IUserActionTokenRepository {
  private readonly database: DrizzleDb;

  constructor({ db }: { db: DrizzleDb }) {
    this.database = db;
  }

  private get db(): DrizzleClient {
    return getClient(this.database);
  }

  /** An upsert on (userId, purpose), so two simultaneous requests leave one token, not two. */
  async issue(data: IssueUserActionTokenData): Promise<UserActionToken> {
    const [row] = await this.db
      .insert(userActionToken)
      .values(data)
      .onConflictDoUpdate({
        target: [userActionToken.userId, userActionToken.purpose],
        set: {
          id: data.id,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          usedAt: null,
          createdAt: new Date(),
        },
      })
      .returning();
    return this.toEntity(row);
  }

  async findLiveForUser(
    userId: string,
    purpose: UserActionTokenPurpose,
    now: Date,
  ): Promise<UserActionToken | null> {
    const [row] = await this.db
      .select()
      .from(userActionToken)
      .where(
        and(
          eq(userActionToken.userId, userId),
          eq(userActionToken.purpose, purpose),
          isNull(userActionToken.usedAt),
          gt(userActionToken.expiresAt, now),
        ),
      )
      .limit(1);
    return row ? this.toEntity(row) : null;
  }

  async findByTokenHash(
    purpose: UserActionTokenPurpose,
    tokenHash: string,
  ): Promise<UserActionToken | null> {
    const [row] = await this.db
      .select()
      .from(userActionToken)
      .where(and(eq(userActionToken.purpose, purpose), eq(userActionToken.tokenHash, tokenHash)))
      .limit(1);
    return row ? this.toEntity(row) : null;
  }

  async consume(id: string, usedAt: Date): Promise<boolean> {
    const rows = await this.db
      .update(userActionToken)
      .set({ usedAt })
      .where(and(eq(userActionToken.id, id), isNull(userActionToken.usedAt)))
      .returning({ id: userActionToken.id });
    return rows.length > 0;
  }

  async deleteForUser(userId: string, purpose: UserActionTokenPurpose): Promise<void> {
    await this.db
      .delete(userActionToken)
      .where(and(eq(userActionToken.userId, userId), eq(userActionToken.purpose, purpose)));
  }

  private toEntity(row: typeof userActionToken.$inferSelect): UserActionToken {
    return {
      id: row.id,
      userId: row.userId,
      purpose: row.purpose as UserActionTokenPurpose,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      usedAt: row.usedAt,
      createdAt: row.createdAt,
    };
  }
}
