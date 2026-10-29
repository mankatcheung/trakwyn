import { and, asc, eq, gt, inArray } from 'drizzle-orm';
import type { DrizzleDb, DrizzleClient } from '../client.js';
import { chatActionProposal } from '../schema.js';
import type { ChatActionProposal } from '#src/domain/chatActionProposal/ChatActionProposal.js';
import type {
  CreateChatActionProposalData,
  IChatActionProposalRepository,
} from '#src/use-cases/ports/IChatActionProposalRepository.js';
import { getClient } from '../transactionContext.js';

export class DrizzleChatActionProposalRepository implements IChatActionProposalRepository {
  private readonly database: DrizzleDb;

  constructor({ db }: { db: DrizzleDb }) {
    this.database = db;
  }

  private get db(): DrizzleClient {
    return getClient(this.database);
  }

  async create(data: CreateChatActionProposalData): Promise<ChatActionProposal> {
    const [row] = await this.db.insert(chatActionProposal).values(data).returning();
    return this.toEntity(row);
  }

  async findByIdForUser(id: string, userId: string): Promise<ChatActionProposal | null> {
    const [row] = await this.db
      .select()
      .from(chatActionProposal)
      .where(and(eq(chatActionProposal.id, id), eq(chatActionProposal.userId, userId)));
    return row ? this.toEntity(row) : null;
  }

  async findAllByConversationId(conversationId: string): Promise<ChatActionProposal[]> {
    const rows = await this.db
      .select()
      .from(chatActionProposal)
      .where(eq(chatActionProposal.conversationId, conversationId))
      .orderBy(asc(chatActionProposal.createdAt));
    return rows.map((r) => this.toEntity(r));
  }

  async attachToMessage(ids: string[], messageId: string): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .update(chatActionProposal)
      .set({ messageId })
      .where(inArray(chatActionProposal.id, ids));
  }

  async claimPending(id: string, userId: string, now: Date): Promise<ChatActionProposal | null> {
    const [row] = await this.db
      .update(chatActionProposal)
      .set({ status: 'confirmed', resolvedAt: now })
      .where(
        and(
          eq(chatActionProposal.id, id),
          eq(chatActionProposal.userId, userId),
          eq(chatActionProposal.status, 'pending'),
          gt(chatActionProposal.expiresAt, now),
        ),
      )
      .returning();
    return row ? this.toEntity(row) : null;
  }

  async resolvePending(
    id: string,
    userId: string,
    status: 'dismissed' | 'expired' | 'failed',
    now: Date,
    error?: string,
  ): Promise<ChatActionProposal | null> {
    const [row] = await this.db
      .update(chatActionProposal)
      .set({ status, resolvedAt: now, error: error ?? null })
      .where(
        and(
          eq(chatActionProposal.id, id),
          eq(chatActionProposal.userId, userId),
          eq(chatActionProposal.status, 'pending'),
        ),
      )
      .returning();
    return row ? this.toEntity(row) : null;
  }

  private toEntity(row: typeof chatActionProposal.$inferSelect): ChatActionProposal {
    return {
      id: row.id,
      userId: row.userId,
      conversationId: row.conversationId,
      messageId: row.messageId,
      toolName: row.toolName,
      args: row.args,
      summary: row.summary,
      status: row.status,
      error: row.error,
      expiresAt: row.expiresAt,
      resolvedAt: row.resolvedAt,
      createdAt: row.createdAt,
    };
  }
}
