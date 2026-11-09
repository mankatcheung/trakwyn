import { eq } from 'drizzle-orm';
import type { DrizzleDb, DrizzleClient } from '../client.js';
import { companyBriefing } from '../schema.js';
import type { CompanyBriefing } from '#src/domain/companyBriefing/CompanyBriefing.js';
import type {
  ICompanyBriefingRepository,
  UpsertCompanyBriefingData,
} from '#src/use-cases/ports/ICompanyBriefingRepository.js';
import { getClient } from '../transactionContext.js';

type Row = typeof companyBriefing.$inferSelect;

export class DrizzleCompanyBriefingRepository implements ICompanyBriefingRepository {
  private readonly database: DrizzleDb;

  constructor({ db }: { db: DrizzleDb }) {
    this.database = db;
  }

  private get db(): DrizzleClient {
    return getClient(this.database);
  }

  private toEntity(row: Row): CompanyBriefing {
    return {
      id: row.id,
      applicationId: row.applicationId,
      content: row.content,
      sources: row.sources,
      generatedAt: row.generatedAt,
    };
  }

  async findByApplicationId(applicationId: string): Promise<CompanyBriefing | null> {
    const [row] = await this.db
      .select()
      .from(companyBriefing)
      .where(eq(companyBriefing.applicationId, applicationId))
      .limit(1);
    return row ? this.toEntity(row) : null;
  }

  async upsert(data: UpsertCompanyBriefingData): Promise<CompanyBriefing> {
    // Conflict target is applicationId, not id: a regenerate arrives with a
    // fresh id and must replace the existing row rather than collide with it.
    const [row] = await this.db
      .insert(companyBriefing)
      .values(data)
      .onConflictDoUpdate({
        target: companyBriefing.applicationId,
        set: { content: data.content, sources: data.sources, generatedAt: data.generatedAt },
      })
      .returning();
    return this.toEntity(row);
  }
}
