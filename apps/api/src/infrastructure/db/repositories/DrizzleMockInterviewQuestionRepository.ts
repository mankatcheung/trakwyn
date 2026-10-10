import { and, asc, eq, lt, sql } from 'drizzle-orm';
import type { DrizzleDb, DrizzleClient } from '../client.js';
import { mockInterviewQuestion, interviewRound } from '../schema.js';
import type { MockInterviewQuestion } from '#src/domain/interviewRound/MockInterviewQuestion.js';
import { getClient, txStorage } from '../transactionContext.js';
import { CONTENT_LIMITS } from '#src/use-cases/constants.js';
import { QuotaExceededError } from '#src/use-cases/errors/DomainError.js';
import type {
  IMockInterviewQuestionRepository,
  CreateMockInterviewQuestionData,
  UpdateMockInterviewQuestionData,
} from '#src/use-cases/ports/IMockInterviewQuestionRepository.js';

export class DrizzleMockInterviewQuestionRepository implements IMockInterviewQuestionRepository {
  private readonly database: DrizzleDb;

  constructor({ db }: { db: DrizzleDb }) {
    this.database = db;
  }

  private get db(): DrizzleClient {
    return getClient(this.database);
  }

  async findAllByRoundId(interviewRoundId: string): Promise<MockInterviewQuestion[]> {
    const rows = await this.db
      .select()
      .from(mockInterviewQuestion)
      .where(eq(mockInterviewQuestion.interviewRoundId, interviewRoundId))
      .orderBy(asc(mockInterviewQuestion.position), asc(mockInterviewQuestion.createdAt));
    return rows.map((r) => this.toEntity(r));
  }

  async findById(id: string): Promise<MockInterviewQuestion | null> {
    const [row] = await this.db
      .select()
      .from(mockInterviewQuestion)
      .where(eq(mockInterviewQuestion.id, id))
      .limit(1);
    return row ? this.toEntity(row) : null;
  }

  async create(data: CreateMockInterviewQuestionData): Promise<MockInterviewQuestion> {
    const exec = async (client: DrizzleClient): Promise<MockInterviewQuestion> => {
      // The counter is the quota's source of truth: incrementing it only while
      // it is under the limit makes the check and the reservation one statement.
      const [reserved] = await client
        .update(interviewRound)
        .set({ mockQuestionCount: sql`${interviewRound.mockQuestionCount} + 1` })
        .where(
          and(
            eq(interviewRound.id, data.interviewRoundId),
            lt(interviewRound.mockQuestionCount, CONTENT_LIMITS.MOCK_QUESTIONS_PER_ROUND),
          ),
        )
        .returning({ id: interviewRound.id });

      if (!reserved) {
        throw new QuotaExceededError(
          `This interview round already has the maximum of ${CONTENT_LIMITS.MOCK_QUESTIONS_PER_ROUND} questions`,
        );
      }

      // Max + 1 rather than the count: deleting from the middle leaves gaps, and
      // the count would then collide with a surviving row's position. The update
      // above holds the round row's lock, so concurrent creates cannot race here.
      const [row] = await client
        .insert(mockInterviewQuestion)
        .values({
          id: data.id,
          interviewRoundId: data.interviewRoundId,
          question: data.question,
          answer: data.answer ?? null,
          answerSource: data.answerSource ?? 'user',
          position: sql`(select coalesce(max(${mockInterviewQuestion.position}) + 1, 0) from ${mockInterviewQuestion} where ${mockInterviewQuestion.interviewRoundId} = ${data.interviewRoundId})`,
        })
        .returning();
      return this.toEntity(row);
    };

    const ambient = txStorage.getStore();
    return ambient ? exec(ambient) : this.database.transaction(exec);
  }

  async update(id: string, data: UpdateMockInterviewQuestionData): Promise<MockInterviewQuestion> {
    const [row] = await this.db
      .update(mockInterviewQuestion)
      .set({
        ...(data.question !== undefined ? { question: data.question } : {}),
        ...(data.answer !== undefined ? { answer: data.answer } : {}),
        ...(data.answerSource !== undefined ? { answerSource: data.answerSource } : {}),
        updatedAt: new Date(),
      })
      .where(eq(mockInterviewQuestion.id, id))
      .returning();
    return this.toEntity(row);
  }

  async delete(id: string): Promise<void> {
    const exec = async (client: DrizzleClient): Promise<void> => {
      const [deleted] = await client
        .delete(mockInterviewQuestion)
        .where(eq(mockInterviewQuestion.id, id))
        .returning({ interviewRoundId: mockInterviewQuestion.interviewRoundId });
      if (!deleted) return;

      await client
        .update(interviewRound)
        .set({
          mockQuestionCount: sql`case when ${interviewRound.mockQuestionCount} > 0 then ${interviewRound.mockQuestionCount} - 1 else 0 end`,
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
          .update(mockInterviewQuestion)
          .set({ position })
          .where(
            and(
              eq(mockInterviewQuestion.id, id),
              eq(mockInterviewQuestion.interviewRoundId, interviewRoundId),
            ),
          );
      }
    };

    const ambient = txStorage.getStore();
    if (ambient) await exec(ambient);
    else await this.database.transaction(exec);
  }

  private toEntity(row: typeof mockInterviewQuestion.$inferSelect): MockInterviewQuestion {
    return {
      id: row.id,
      interviewRoundId: row.interviewRoundId,
      question: row.question,
      answer: row.answer,
      answerSource: row.answerSource === 'ai' ? 'ai' : 'user',
      position: row.position,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
