import { eq } from 'drizzle-orm';
import type { DrizzleDb, DrizzleClient } from '../client.js';
import { resumeMatch } from '../schema.js';
import type { ResumeMatch } from '#src/domain/resumeMatch/ResumeMatch.js';
import type { IResumeMatchRepository } from '#src/use-cases/ports/IResumeMatchRepository.js';
import { getClient } from '../transactionContext.js';

type Row = typeof resumeMatch.$inferSelect;

function parseKeywords(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

export class DrizzleResumeMatchRepository implements IResumeMatchRepository {
  private readonly database: DrizzleDb;

  constructor({ db }: { db: DrizzleDb }) {
    this.database = db;
  }

  private get db(): DrizzleClient {
    return getClient(this.database);
  }

  private toEntity(row: Row): ResumeMatch {
    return {
      id: row.id,
      applicationId: row.applicationId,
      documentDraftId: row.documentDraftId,
      documentId: row.documentId,
      score: row.score,
      label: row.label,
      matchedKeywords: parseKeywords(row.matchedKeywords),
      missingKeywords: parseKeywords(row.missingKeywords),
      summary: row.summary,
      generatedAt: row.generatedAt,
      resumeTextHash: row.resumeTextHash,
    };
  }

  async findByApplicationId(applicationId: string): Promise<ResumeMatch[]> {
    const rows = await this.db
      .select()
      .from(resumeMatch)
      .where(eq(resumeMatch.applicationId, applicationId));
    return rows.map((row) => this.toEntity(row));
  }

  async upsert(data: ResumeMatch): Promise<ResumeMatch> {
    // Conflict target is the resume's own id, not `id`: a regenerate arrives
    // with a fresh id and must replace the existing row rather than collide.
    const target = data.documentDraftId ? resumeMatch.documentDraftId : resumeMatch.documentId;
    const values = {
      ...data,
      matchedKeywords: JSON.stringify(data.matchedKeywords),
      missingKeywords: JSON.stringify(data.missingKeywords),
    };
    const [row] = await this.db
      .insert(resumeMatch)
      .values(values)
      .onConflictDoUpdate({
        target,
        set: {
          id: values.id,
          score: values.score,
          label: values.label,
          matchedKeywords: values.matchedKeywords,
          missingKeywords: values.missingKeywords,
          summary: values.summary,
          generatedAt: values.generatedAt,
          resumeTextHash: values.resumeTextHash,
        },
      })
      .returning();
    return this.toEntity(row);
  }
}
