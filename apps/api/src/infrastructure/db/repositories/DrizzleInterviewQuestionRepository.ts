import { and, asc, eq, lt, sql } from 'drizzle-orm';
import type { DrizzleDb, DrizzleClient } from '../client.js';
import { interviewQuestion, interviewRound } from '../schema.js';
import type { InterviewQuestion } from '#src/domain/interviewRound/InterviewQuestion.js';
import { getClient, txStorage } from '../transactionContext.js';
import { CONTENT_LIMITS } from '#src/use-cases/constants.js';
import { QuotaExceededError } from '#src/use-cases/errors/DomainError.js';
import type {
  IInterviewQuestionRepository,
  CreateInterviewQuestionData,
  UpdateInterviewQuestionData,
} from '#src/use-cases/ports/IInterviewQuestionRepository.js';

export class DrizzleInterviewQuestionRepository implements IInterviewQuestionRepository {
  private readonly database: DrizzleDb;

  constructor({ db }: { db: DrizzleDb }) {
    this.database = db;
  }

  private get db(): DrizzleClient {
    return getClient(this.database);
  }

  async findAllByRoundId(interviewRoundId: string): Promise<InterviewQuestion[]> {
    const rows = await this.db
      .select()
      .from(interviewQuestion)
      .where(eq(interviewQuestion.interviewRoundId, interviewRoundId))
      .orderBy(asc(interviewQuestion.position), asc(interviewQuestion.createdAt));
    return rows.map((r) => this.toEntity(r));
  }

  async findById(id: string): Promise<InterviewQuestion | null> {
    const [row] = await this.db
      .select()
      .from(interviewQuestion)
      .where(eq(interviewQuestion.id, id))
      .limit(1);
    return row ? this.toEntity(row) : null;
  }

  async create(data: CreateInterviewQuestionData): Promise<InterviewQuestion> {
    const exec = async (client: DrizzleClient): Promise<InterviewQuestion> => {
      // The counter is the quota's source of truth: incrementing it only while
      // it is under the limit makes the check and the reservation one statement.
      const [reserved] = await client
        .update(interviewRound)
        .set({ questionCount: sql`${interviewRound.questionCount} + 1` })
        .where(
          and(
            eq(interviewRound.id, data.interviewRoundId),
            lt(interviewRound.questionCount, CONTENT_LIMITS.QUESTIONS_PER_ROUND),
          ),
        )
        .returning({ id: interviewRound.id });

      if (!reserved) {
        throw new QuotaExceededError(
          `This interview round already has the maximum of ${CONTENT_LIMITS.QUESTIONS_PER_ROUND} questions`,
        );
      }

      // Max + 1 rather than the count: deleting from the middle leaves gaps, and
      // the count would then collide with a surviving row's position. The update
      // above holds the round row's lock, so concurrent creates cannot race here.
      const [row] = await client
        .insert(interviewQuestion)
        .values({
          id: data.id,
          interviewRoundId: data.interviewRoundId,
          question: data.question,
          answer: data.answer ?? null,
          position: sql`(select coalesce(max(${interviewQuestion.position}) + 1, 0) from ${interviewQuestion} where ${interviewQuestion.interviewRoundId} = ${data.interviewRoundId})`,
        })
        .returning();
      return this.toEntity(row);
    };

    const ambient = txStorage.getStore();
    return ambient ? exec(ambient) : this.database.transaction(exec);
  }

  async update(id: string, data: UpdateInterviewQuestionData): Promise<InterviewQuestion> {
    const [row] = await this.db
      .update(interviewQuestion)
      .set({
        ...(data.question !== undefined ? { question: data.question } : {}),
        ...(data.answer !== undefined ? { answer: data.answer } : {}),
        updatedAt: new Date(),
      })
      .where(eq(interviewQuestion.id, id))
      .returning();
    return this.toEntity(row);
  }

  async delete(id: string): Promise<void> {
    const exec = async (client: DrizzleClient): Promise<void> => {
      const [deleted] = await client
        .delete(interviewQuestion)
        .where(eq(interviewQuestion.id, id))
        .returning({ interviewRoundId: interviewQuestion.interviewRoundId });
      if (!deleted) return;

      await client
        .update(interviewRound)
        .set({
          questionCount: sql`case when ${interviewRound.questionCount} > 0 then ${interviewRound.questionCount} - 1 else 0 end`,
        })
        .where(eq(interviewRound.id, deleted.interviewRoundId));
    };

    const ambient = txStorage.getStore();
    if (ambient) await exec(ambient);
    else await this.database.transaction(exec);
  }

  async reorder(interviewRoundId: string, orderedIds: string[]): Promise<void> {
    const exec = async (client: DrizzleClient): Promise<void> => {
      for (const [position, id] of orderedIds.entries()) {
        await client
          .update(interviewQuestion)
          .set({ position })
          .where(
            and(
              eq(interviewQuestion.id, id),
              eq(interviewQuestion.interviewRoundId, interviewRoundId),
            ),
          );
      }
    };

    const ambient = txStorage.getStore();
    if (ambient) await exec(ambient);
    else await this.database.transaction(exec);
  }

  private toEntity(row: typeof interviewQuestion.$inferSelect): InterviewQuestion {
    return {
      id: row.id,
      interviewRoundId: row.interviewRoundId,
      question: row.question,
      answer: row.answer,
      position: row.position,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
