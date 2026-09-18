import { and, eq, desc, exists, or, sql } from 'drizzle-orm';
import type { DrizzleDb, DrizzleClient } from '../client.js';
import { conversation, message } from '../schema.js';
import type { Conversation } from '#src/domain/conversation/Conversation.js';
import type {
  IConversationRepository,
  CreateConversationData,
} from '#src/use-cases/ports/IConversationRepository.js';
import { getClient } from '../transactionContext.js';

export class DrizzleConversationRepository implements IConversationRepository {
  private readonly database: DrizzleDb;

  constructor({ db }: { db: DrizzleDb }) {
    this.database = db;
  }

  private get db(): DrizzleClient {
    return getClient(this.database);
  }

  async create(data: CreateConversationData): Promise<Conversation> {
    const [row] = await this.db.insert(conversation).values(data).returning();
    return this.toEntity(row);
  }

  async findById(id: string): Promise<Conversation | null> {
    const [row] = await this.db.select().from(conversation).where(eq(conversation.id, id));
    return row ? this.toEntity(row) : null;
  }

  async findAllByUserId(userId: string, limit?: number): Promise<Conversation[]> {
    const rows = await this.db
      .select()
      .from(conversation)
      .where(eq(conversation.userId, userId))
      .orderBy(desc(conversation.updatedAt))
      .limit(limit ?? -1);
    return rows.map((r) => this.toEntity(r));
  }

  async searchByUserId(userId: string, searchTerm: string): Promise<Conversation[]> {
    // LIKE wildcards in user input are escaped so a search for "50%" finds
    // the literal string, not every title containing "50" plus anything
    // ending in a digit.
    const pattern = `%${searchTerm.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
    // Drizzle's ilike() helper has no escape-char parameter, so the ESCAPE
    // clause that makes those escapes meaningful is spelled out here. ILIKE
    // keeps the search case-insensitive, as SQLite's LIKE was.
    const titleMatch = sql`${conversation.title} ILIKE ${pattern} ESCAPE '\\'`;
    const contentMatch = exists(
      this.db
        .select({ one: sql`1` })
        .from(message)
        .where(
          and(
            eq(message.conversationId, conversation.id),
            sql`${message.content} ILIKE ${pattern} ESCAPE '\\'`,
          ),
        ),
    );
    const rows = await this.db
      .select()
      .from(conversation)
      .where(and(eq(conversation.userId, userId), or(titleMatch, contentMatch)))
      .orderBy(desc(conversation.updatedAt));
    return rows.map((r) => this.toEntity(r));
  }

  async updateTitle(id: string, title: string): Promise<void> {
    await this.db.update(conversation).set({ title }).where(eq(conversation.id, id));
  }

  async updateLlmSettings(id: string, llmProvider: string, llmModel: string | null): Promise<void> {
    await this.db
      .update(conversation)
      .set({ llmProvider, llmModel })
      .where(eq(conversation.id, id));
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(conversation).where(eq(conversation.id, id));
  }

  private toEntity(row: typeof conversation.$inferSelect): Conversation {
    return {
      id: row.id,
      userId: row.userId,
      title: row.title,
      llmProvider: row.llmProvider,
      llmModel: row.llmModel,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
