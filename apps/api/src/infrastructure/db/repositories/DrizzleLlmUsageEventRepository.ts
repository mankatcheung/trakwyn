import { and, eq, gte, sql, desc } from 'drizzle-orm';
import type { DrizzleDb, DrizzleClient } from '../client.js';
import { llmUsageEvent } from '../schema.js';
import type { LlmUsageSummary } from '#src/domain/llmUsageEvent/LlmUsageEvent.js';
import type {
  ILlmUsageEventRepository,
  RecordLlmUsageEventData,
} from '#src/use-cases/ports/ILlmUsageEventRepository.js';
import { getClient } from '../transactionContext.js';

export class DrizzleLlmUsageEventRepository implements ILlmUsageEventRepository {
  private readonly database: DrizzleDb;

  constructor({ db }: { db: DrizzleDb }) {
    this.database = db;
  }

  private get db(): DrizzleClient {
    return getClient(this.database);
  }

  async record(data: RecordLlmUsageEventData): Promise<void> {
    await this.db.insert(llmUsageEvent).values(data);
  }

  async summarizeByUserId(userId: string, since: Date): Promise<LlmUsageSummary[]> {
    const rows = await this.db
      .select({
        provider: llmUsageEvent.provider,
        requestCount: sql<number>`count(*)`,
        promptTokens: sql<number>`coalesce(sum(${llmUsageEvent.promptTokens}), 0)`,
        completionTokens: sql<number>`coalesce(sum(${llmUsageEvent.completionTokens}), 0)`,
        cacheReadTokens: sql<number>`coalesce(sum(${llmUsageEvent.cacheReadTokens}), 0)`,
        cacheWriteTokens: sql<number>`coalesce(sum(${llmUsageEvent.cacheWriteTokens}), 0)`,
        lastUsedAt: sql<number>`max(${llmUsageEvent.createdAt})`,
      })
      .from(llmUsageEvent)
      .where(and(eq(llmUsageEvent.userId, userId), gte(llmUsageEvent.createdAt, since)))
      .groupBy(llmUsageEvent.provider)
      .orderBy(desc(sql`max(${llmUsageEvent.createdAt})`));

    return rows.map((row) => ({
      provider: row.provider,
      requestCount: Number(row.requestCount),
      promptTokens: Number(row.promptTokens),
      completionTokens: Number(row.completionTokens),
      cacheReadTokens: Number(row.cacheReadTokens),
      cacheWriteTokens: Number(row.cacheWriteTokens),
      lastUsedAt: new Date(Number(row.lastUsedAt)),
    }));
  }
}
