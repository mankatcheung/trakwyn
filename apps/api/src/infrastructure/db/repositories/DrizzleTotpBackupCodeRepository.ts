import { and, eq, isNull } from 'drizzle-orm';
import type { DrizzleDb, DrizzleClient } from '../client.js';
import { totpBackupCode } from '../schema.js';
import type { TotpBackupCode } from '#src/domain/totpBackupCode/TotpBackupCode.js';
import type { ITotpBackupCodeRepository } from '#src/use-cases/ports/ITotpBackupCodeRepository.js';
import { getClient } from '../transactionContext.js';

export class DrizzleTotpBackupCodeRepository implements ITotpBackupCodeRepository {
  private readonly database: DrizzleDb;

  constructor({ db }: { db: DrizzleDb }) {
    this.database = db;
  }

  private get db(): DrizzleClient {
    return getClient(this.database);
  }

  async create(data: { id: string; userId: string; codeHash: string }): Promise<TotpBackupCode> {
    const [row] = await this.db.insert(totpBackupCode).values(data).returning();
    return this.toEntity(row);
  }

  async findByCodeHash(codeHash: string): Promise<TotpBackupCode | null> {
    const [row] = await this.db
      .select()
      .from(totpBackupCode)
      .where(eq(totpBackupCode.codeHash, codeHash))
      .limit(1);
    return row ? this.toEntity(row) : null;
  }

  async markUsed(id: string): Promise<boolean> {
    const rows = await this.db
      .update(totpBackupCode)
      .set({ usedAt: new Date() })
      .where(and(eq(totpBackupCode.id, id), isNull(totpBackupCode.usedAt)))
      .returning({ id: totpBackupCode.id });
    return rows.length > 0;
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await this.db.delete(totpBackupCode).where(eq(totpBackupCode.userId, userId));
  }

  private toEntity(row: typeof totpBackupCode.$inferSelect): TotpBackupCode {
    return {
      id: row.id,
      userId: row.userId,
      codeHash: row.codeHash,
      usedAt: row.usedAt,
      createdAt: row.createdAt,
    };
  }
}
