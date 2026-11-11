import { eq, and, ne, isNull, desc, sql } from 'drizzle-orm';
import type { DrizzleDb, DrizzleClient } from '../client.js';
import { documentDraft, jobApplication } from '../schema.js';
import type { DocumentDraft } from '#src/domain/documentDraft/DocumentDraft.js';
import type {
  IDocumentDraftRepository,
  CreateDocumentDraftData,
  UpdateDocumentDraftContentData,
} from '#src/use-cases/ports/IDocumentDraftRepository.js';
import { getClient } from '../transactionContext.js';
import type { AiGeneration } from '#src/domain/aiFeedback/AiFeedback.js';
import { generationFromColumns, generationToColumns } from './aiGenerationColumns.js';

export class DrizzleDocumentDraftRepository implements IDocumentDraftRepository {
  private readonly database: DrizzleDb;

  constructor({ db }: { db: DrizzleDb }) {
    this.database = db;
  }

  private get db(): DrizzleClient {
    return getClient(this.database);
  }

  async countByApplicationId(applicationId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(documentDraft)
      .where(eq(documentDraft.applicationId, applicationId));
    return Number(row?.count ?? 0);
  }

  async countWithTextByApplicationId(applicationId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(documentDraft)
      .where(
        and(
          eq(documentDraft.applicationId, applicationId),
          // A draft with no text yet (a blank one the editor made on open) does not use up a slot (JEF-506).
          sql`${documentDraft.plainText} ~ '\\S'`,
        ),
      );
    return Number(row?.count ?? 0);
  }

  async findAllByApplicationId(applicationId: string): Promise<DocumentDraft[]> {
    const rows = await this.db
      .select()
      .from(documentDraft)
      .where(eq(documentDraft.applicationId, applicationId))
      .orderBy(desc(documentDraft.updatedAt));
    return rows.map((r) => this.toEntity(r));
  }

  async findById(id: string): Promise<DocumentDraft | null> {
    const [row] = await this.db
      .select()
      .from(documentDraft)
      .where(eq(documentDraft.id, id))
      .limit(1);
    return row ? this.toEntity(row) : null;
  }

  async create(data: CreateDocumentDraftData): Promise<DocumentDraft> {
    const [row] = await this.db
      .insert(documentDraft)
      .values({
        id: data.id,
        applicationId: data.applicationId,
        type: data.type,
        title: data.title,
        contentJson: data.contentJson ?? '{}',
        plainText: data.plainText ?? '',
        sourceDocumentId: data.sourceDocumentId ?? null,
        aiInstructions: data.aiInstructions ?? null,
      })
      .returning();
    return this.toEntity(row);
  }

  async updateContent(id: string, data: UpdateDocumentDraftContentData): Promise<DocumentDraft> {
    const [row] = await this.db
      .update(documentDraft)
      .set({
        contentJson: data.contentJson,
        plainText: data.plainText,
        // Absent leaves the saved instructions alone; null clears them.
        ...(data.aiInstructions !== undefined ? { aiInstructions: data.aiInstructions } : {}),
        updatedAt: new Date(),
      })
      .where(eq(documentDraft.id, id))
      .returning();
    return this.toEntity(row);
  }

  async rename(id: string, title: string): Promise<DocumentDraft> {
    const [row] = await this.db
      .update(documentDraft)
      .set({ title, updatedAt: new Date() })
      .where(eq(documentDraft.id, id))
      .returning();
    return this.toEntity(row);
  }

  async recordGeneration(id: string, generation: AiGeneration): Promise<void> {
    await this.db
      .update(documentDraft)
      .set(generationToColumns(generation))
      .where(eq(documentDraft.id, id));
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(documentDraft).where(eq(documentDraft.id, id));
  }

  async findRecentCoverLettersByUserExcludingApplication(
    userId: string,
    excludeApplicationId: string,
    limit: number,
  ): Promise<DocumentDraft[]> {
    const rows = await this.db
      .select({ documentDraft })
      .from(documentDraft)
      .innerJoin(jobApplication, eq(documentDraft.applicationId, jobApplication.id))
      .where(
        and(
          eq(jobApplication.userId, userId),
          eq(documentDraft.type, 'cover_letter'),
          ne(jobApplication.id, excludeApplicationId),
          isNull(jobApplication.deletedAt),
        ),
      )
      .orderBy(desc(documentDraft.updatedAt))
      .limit(limit);
    return rows.map((r) => this.toEntity(r.documentDraft));
  }

  private toEntity(row: typeof documentDraft.$inferSelect): DocumentDraft {
    return {
      id: row.id,
      applicationId: row.applicationId,
      type: row.type as 'cover_letter' | 'resume',
      title: row.title,
      contentJson: row.contentJson,
      plainText: row.plainText,
      sourceDocumentId: row.sourceDocumentId,
      aiInstructions: row.aiInstructions,
      generation: generationFromColumns(row),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
