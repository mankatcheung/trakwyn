import { desc, eq, inArray } from 'drizzle-orm';
import type { DrizzleDb, DrizzleClient } from '../client.js';
import { documentDraftVersion } from '../schema.js';
import type { DocumentDraftVersion } from '#src/domain/documentDraft/DocumentDraftVersion.js';
import type {
  CreateDocumentDraftVersionData,
  IDocumentDraftVersionRepository,
} from '#src/use-cases/ports/IDocumentDraftVersionRepository.js';
import { getClient } from '../transactionContext.js';

type Row = typeof documentDraftVersion.$inferSelect;

export class DrizzleDocumentDraftVersionRepository implements IDocumentDraftVersionRepository {
  private readonly database: DrizzleDb;

  constructor({ db }: { db: DrizzleDb }) {
    this.database = db;
  }

  private get db(): DrizzleClient {
    return getClient(this.database);
  }

  async create(data: CreateDocumentDraftVersionData): Promise<DocumentDraftVersion> {
    const [row] = await this.db.insert(documentDraftVersion).values(data).returning();
    return this.toEntity(row);
  }

  async listByDraft(draftId: string): Promise<DocumentDraftVersion[]> {
    const rows = await this.db
      .select()
      .from(documentDraftVersion)
      .where(eq(documentDraftVersion.draftId, draftId))
      .orderBy(desc(documentDraftVersion.createdAt), desc(documentDraftVersion.id));
    return rows.map((row) => this.toEntity(row));
  }

  async findById(id: string): Promise<DocumentDraftVersion | null> {
    const [row] = await this.db
      .select()
      .from(documentDraftVersion)
      .where(eq(documentDraftVersion.id, id))
      .limit(1);
    return row ? this.toEntity(row) : null;
  }

  async findLatestByDraft(draftId: string): Promise<DocumentDraftVersion | null> {
    const [row] = await this.db
      .select()
      .from(documentDraftVersion)
      .where(eq(documentDraftVersion.draftId, draftId))
      .orderBy(desc(documentDraftVersion.createdAt), desc(documentDraftVersion.id))
      .limit(1);
    return row ? this.toEntity(row) : null;
  }

  async pruneToLimit(draftId: string, limit: number): Promise<number> {
    // Only the ids are read, so a draft with a full history does not pull its content just to trim it.
    const rows = await this.db
      .select({ id: documentDraftVersion.id })
      .from(documentDraftVersion)
      .where(eq(documentDraftVersion.draftId, draftId))
      .orderBy(desc(documentDraftVersion.createdAt), desc(documentDraftVersion.id))
      .offset(limit);
    if (rows.length === 0) return 0;
    await this.db.delete(documentDraftVersion).where(
      inArray(
        documentDraftVersion.id,
        rows.map((row) => row.id),
      ),
    );
    return rows.length;
  }

  private toEntity(row: Row): DocumentDraftVersion {
    return {
      id: row.id,
      draftId: row.draftId,
      contentJson: row.contentJson,
      plainText: row.plainText,
      source: row.source,
      createdAt: row.createdAt,
    };
  }
}
