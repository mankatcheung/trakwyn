import { count, eq } from 'drizzle-orm';
import type { DrizzleDb, DrizzleClient } from '../client.js';
import { resumeGapDismissal } from '../schema.js';
import type { IResumeGapDismissalRepository } from '#src/use-cases/ports/IResumeGapDismissalRepository.js';
import { getClient } from '../transactionContext.js';

export class DrizzleResumeGapDismissalRepository implements IResumeGapDismissalRepository {
  private readonly database: DrizzleDb;

  constructor({ db }: { db: DrizzleDb }) {
    this.database = db;
  }

  private get db(): DrizzleClient {
    return getClient(this.database);
  }

  async findKeysByApplicationId(applicationId: string): Promise<string[]> {
    const rows = await this.db
      .select({ key: resumeGapDismissal.key })
      .from(resumeGapDismissal)
      .where(eq(resumeGapDismissal.applicationId, applicationId));
    return rows.map((row) => row.key);
  }

  async add(data: { id: string; applicationId: string; key: string }): Promise<void> {
    // The unique (applicationId, key) index makes a repeat a no-op, not an error.
    await this.db.insert(resumeGapDismissal).values(data).onConflictDoNothing();
  }

  async countByApplicationId(applicationId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(resumeGapDismissal)
      .where(eq(resumeGapDismissal.applicationId, applicationId));
    return row?.total ?? 0;
  }
}
