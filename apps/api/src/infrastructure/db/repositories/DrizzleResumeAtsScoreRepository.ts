import { eq } from 'drizzle-orm';
import type { DrizzleDb, DrizzleClient } from '../client.js';
import { resumeAtsScore } from '../schema.js';
import type { AtsCheck, SavedAtsScore } from '#src/domain/resume/AtsScore.js';
import type { IResumeAtsScoreRepository } from '#src/use-cases/ports/IResumeAtsScoreRepository.js';
import { getClient } from '../transactionContext.js';

type Row = typeof resumeAtsScore.$inferSelect;

function parseChecks(raw: string): AtsCheck[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AtsCheck[]) : [];
  } catch {
    return [];
  }
}

export class DrizzleResumeAtsScoreRepository implements IResumeAtsScoreRepository {
  private readonly database: DrizzleDb;

  constructor({ db }: { db: DrizzleDb }) {
    this.database = db;
  }

  private get db(): DrizzleClient {
    return getClient(this.database);
  }

  private toEntity(row: Row): SavedAtsScore {
    return {
      id: row.id,
      applicationId: row.applicationId,
      documentDraftId: row.documentDraftId,
      documentId: row.documentId,
      score: row.score,
      label: row.label,
      readable: row.readable,
      checks: parseChecks(row.checksJson),
      generatedAt: row.generatedAt,
      resumeTextHash: row.resumeTextHash,
    };
  }

  async findByApplicationId(applicationId: string): Promise<SavedAtsScore[]> {
    const rows = await this.db
      .select()
      .from(resumeAtsScore)
      .where(eq(resumeAtsScore.applicationId, applicationId));
    return rows.map((row) => this.toEntity(row));
  }

  async upsert(data: SavedAtsScore): Promise<SavedAtsScore> {
    // Conflict target is the resume's own id, not `id`: a re-check arrives
    // with a fresh id and must replace the existing row rather than collide.
    const target = data.documentDraftId
      ? resumeAtsScore.documentDraftId
      : resumeAtsScore.documentId;
    const { checks, ...rest } = data;
    const values = { ...rest, checksJson: JSON.stringify(checks) };
    const [row] = await this.db
      .insert(resumeAtsScore)
      .values(values)
      .onConflictDoUpdate({
        target,
        set: {
          id: values.id,
          score: values.score,
          label: values.label,
          readable: values.readable,
          checksJson: values.checksJson,
          generatedAt: values.generatedAt,
          resumeTextHash: values.resumeTextHash,
        },
      })
      .returning();
    return this.toEntity(row);
  }
}
