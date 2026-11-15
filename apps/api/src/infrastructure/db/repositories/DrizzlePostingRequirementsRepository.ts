import { eq } from 'drizzle-orm';
import type { DrizzleDb, DrizzleClient } from '../client.js';
import { postingRequirements } from '../schema.js';
import type { PostingRequirements } from '#src/domain/postingRequirements/PostingRequirements.js';
import type { IPostingRequirementsRepository } from '#src/use-cases/ports/IPostingRequirementsRepository.js';
import { getClient } from '../transactionContext.js';

type Row = typeof postingRequirements.$inferSelect;

function parseList(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

export class DrizzlePostingRequirementsRepository implements IPostingRequirementsRepository {
  private readonly database: DrizzleDb;

  constructor({ db }: { db: DrizzleDb }) {
    this.database = db;
  }

  private get db(): DrizzleClient {
    return getClient(this.database);
  }

  private toEntity(row: Row): PostingRequirements {
    return {
      id: row.id,
      applicationId: row.applicationId,
      mustHave: parseList(row.mustHave),
      niceToHave: parseList(row.niceToHave),
      keywords: parseList(row.keywords),
      seniority: row.seniority,
      postingHash: row.postingHash,
      promptVersion: row.promptVersion,
      generatedAt: row.generatedAt,
    };
  }

  async findByApplicationId(applicationId: string): Promise<PostingRequirements | null> {
    const [row] = await this.db
      .select()
      .from(postingRequirements)
      .where(eq(postingRequirements.applicationId, applicationId));
    return row ? this.toEntity(row) : null;
  }

  async upsert(data: PostingRequirements): Promise<PostingRequirements> {
    const values = {
      ...data,
      mustHave: JSON.stringify(data.mustHave),
      niceToHave: JSON.stringify(data.niceToHave),
      keywords: JSON.stringify(data.keywords),
    };
    // Conflict target is the application, not `id`: a re-extract arrives with
    // a fresh id and must replace the existing row rather than collide.
    const [row] = await this.db
      .insert(postingRequirements)
      .values(values)
      .onConflictDoUpdate({
        target: postingRequirements.applicationId,
        set: {
          id: values.id,
          mustHave: values.mustHave,
          niceToHave: values.niceToHave,
          keywords: values.keywords,
          seniority: values.seniority,
          postingHash: values.postingHash,
          promptVersion: values.promptVersion,
          generatedAt: values.generatedAt,
        },
      })
      .returning();
    return this.toEntity(row);
  }
}
