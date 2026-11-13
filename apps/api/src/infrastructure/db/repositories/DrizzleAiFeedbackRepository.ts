import { and, eq, inArray } from 'drizzle-orm';
import type { DrizzleDb, DrizzleClient } from '../client.js';
import { aiFeedback } from '../schema.js';
import type { AiFeedback } from '#src/domain/aiFeedback/AiFeedback.js';
import type {
  IAiFeedbackRepository,
  UpsertAiFeedbackData,
} from '#src/use-cases/ports/IAiFeedbackRepository.js';
import type { AiFeedbackTarget } from '#src/use-cases/constants.js';
import { getClient } from '../transactionContext.js';

export class DrizzleAiFeedbackRepository implements IAiFeedbackRepository {
  private readonly database: DrizzleDb;

  constructor({ db }: { db: DrizzleDb }) {
    this.database = db;
  }

  private get db(): DrizzleClient {
    return getClient(this.database);
  }

  async upsert(data: UpsertAiFeedbackData): Promise<AiFeedback> {
    const columns = {
      feature: data.feature,
      rating: data.rating,
      reason: data.reason,
      provider: data.generation?.provider ?? null,
      model: data.generation?.model ?? null,
      promptVersion: data.generation?.promptVersion ?? null,
      source: data.generation?.source ?? null,
      tier: data.generation?.tier ?? null,
      traceId: data.generation?.traceId ?? null,
    };
    const [row] = await this.db
      .insert(aiFeedback)
      .values({
        id: data.id,
        userId: data.userId,
        targetKind: data.targetKind,
        targetId: data.targetId,
        ...columns,
      })
      .onConflictDoUpdate({
        target: [aiFeedback.userId, aiFeedback.targetKind, aiFeedback.targetId],
        // The first rating's id and createdAt stay; rating again replaces the rest.
        set: { ...columns, updatedAt: new Date() },
      })
      .returning();
    return this.toEntity(row);
  }

  async clear(
    userId: string,
    targetKind: AiFeedbackTarget,
    targetId: string,
  ): Promise<AiFeedback | null> {
    const [row] = await this.db
      .delete(aiFeedback)
      .where(
        and(
          eq(aiFeedback.userId, userId),
          eq(aiFeedback.targetKind, targetKind),
          eq(aiFeedback.targetId, targetId),
        ),
      )
      .returning();
    return row ? this.toEntity(row) : null;
  }

  async findForTargets(
    userId: string,
    targetKind: AiFeedbackTarget,
    targetIds: string[],
  ): Promise<AiFeedback[]> {
    if (targetIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(aiFeedback)
      .where(
        and(
          eq(aiFeedback.userId, userId),
          eq(aiFeedback.targetKind, targetKind),
          inArray(aiFeedback.targetId, targetIds),
        ),
      );
    return rows.map((r) => this.toEntity(r));
  }

  private toEntity(row: typeof aiFeedback.$inferSelect): AiFeedback {
    return {
      id: row.id,
      userId: row.userId,
      targetKind: row.targetKind,
      targetId: row.targetId,
      feature: row.feature,
      rating: row.rating,
      reason: row.reason,
      generation:
        row.provider !== null && row.source !== null
          ? {
              provider: row.provider,
              model: row.model,
              promptVersion: row.promptVersion,
              source: row.source,
              tier: row.tier,
              traceId: row.traceId,
            }
          : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
