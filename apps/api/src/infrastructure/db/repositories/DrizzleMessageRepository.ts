import { and, asc, desc, eq, notInArray } from 'drizzle-orm';
import type { DrizzleDb, DrizzleClient } from '../client.js';
import { message } from '../schema.js';
import type { Message } from '#src/domain/message/Message.js';
import type {
  IMessageRepository,
  CreateMessageData,
} from '#src/use-cases/ports/IMessageRepository.js';
import { getClient } from '../transactionContext.js';
import { generationFromColumns, generationToColumns } from './aiGenerationColumns.js';

export class DrizzleMessageRepository implements IMessageRepository {
  private readonly database: DrizzleDb;

  constructor({ db }: { db: DrizzleDb }) {
    this.database = db;
  }

  private get db(): DrizzleClient {
    return getClient(this.database);
  }

  async create(data: CreateMessageData): Promise<Message> {
    const { generation, ...rest } = data;
    const [row] = await this.db
      .insert(message)
      .values({ ...rest, ...generationToColumns(generation) })
      .returning();
    return this.toEntity(row);
  }

  async findById(id: string): Promise<Message | null> {
    const [row] = await this.db.select().from(message).where(eq(message.id, id));
    return row ? this.toEntity(row) : null;
  }

  async findAllByConversationId(conversationId: string): Promise<Message[]> {
    const rows = await this.db
      .select()
      .from(message)
      .where(eq(message.conversationId, conversationId))
      .orderBy(asc(message.createdAt));
    return rows.map((r) => this.toEntity(r));
  }

  async trimToLatest(conversationId: string, keep: number): Promise<void> {
    // id breaks a tie between messages stored in the same millisecond.
    const newest = this.db
      .select({ id: message.id })
      .from(message)
      .where(eq(message.conversationId, conversationId))
      .orderBy(desc(message.createdAt), desc(message.id))
      .limit(keep);
    await this.db
      .delete(message)
      .where(and(eq(message.conversationId, conversationId), notInArray(message.id, newest)));
  }

  private toEntity(row: typeof message.$inferSelect): Message {
    return {
      id: row.id,
      conversationId: row.conversationId,
      role: row.role,
      content: row.content,
      toolTrace: row.toolTrace,
      generation: generationFromColumns(row),
      createdAt: row.createdAt,
    };
  }
}
