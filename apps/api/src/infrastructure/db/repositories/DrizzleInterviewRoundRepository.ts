import { eq, asc, and, gt, lte, isNull, sql } from 'drizzle-orm';
import type { DrizzleDb, DrizzleClient } from '../client.js';
import { interviewRound, jobApplication } from '../schema.js';
import type {
  InterviewRound,
  InterviewRoundType,
  InterviewRoundOutcome,
} from '#src/domain/interviewRound/InterviewRound.js';
import { getClient } from '../transactionContext.js';
import { DEFAULTS } from '#src/use-cases/constants.js';
import type {
  IInterviewRoundRepository,
  CreateInterviewRoundData,
  UpdateInterviewRoundData,
} from '#src/use-cases/ports/IInterviewRoundRepository.js';

export class DrizzleInterviewRoundRepository implements IInterviewRoundRepository {
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
      .from(interviewRound)
      .where(eq(interviewRound.applicationId, applicationId));
    return Number(row?.count ?? 0);
  }

  async findAllByApplicationId(applicationId: string): Promise<InterviewRound[]> {
    const rows = await this.db
      .select()
      .from(interviewRound)
      .where(eq(interviewRound.applicationId, applicationId))
      .orderBy(asc(interviewRound.createdAt));
    return rows.map((r) => this.toEntity(r));
  }

  async findAllByUserId(userId: string): Promise<InterviewRound[]> {
    const rows = await this.db
      .select({ interviewRound })
      .from(interviewRound)
      .innerJoin(jobApplication, eq(interviewRound.applicationId, jobApplication.id))
      .where(eq(jobApplication.userId, userId))
      .orderBy(asc(interviewRound.createdAt));
    return rows.map((r) => this.toEntity(r.interviewRound));
  }

  async findById(id: string): Promise<InterviewRound | null> {
    const [row] = await this.db
      .select()
      .from(interviewRound)
      .where(eq(interviewRound.id, id))
      .limit(1);
    return row ? this.toEntity(row) : null;
  }

  async findUpcomingWithinWindow(windowMs: number): Promise<InterviewRound[]> {
    const now = new Date();
    const cutoff = new Date(now.getTime() + windowMs);
    const rows = await this.db
      .select()
      .from(interviewRound)
      .where(
        and(
          gt(interviewRound.scheduledAt, now),
          lte(interviewRound.scheduledAt, cutoff),
          isNull(interviewRound.completedAt),
          isNull(interviewRound.pushNotificationSentAt),
        ),
      )
      .orderBy(asc(interviewRound.scheduledAt));
    return rows.map((r) => this.toEntity(r));
  }

  async create(data: CreateInterviewRoundData): Promise<InterviewRound> {
    const [row] = await this.db
      .insert(interviewRound)
      .values({
        id: data.id,
        applicationId: data.applicationId,
        type: data.type,
        scheduledAt: data.scheduledAt ?? null,
        completedAt: data.completedAt ?? null,
        interviewerName: data.interviewerName ?? null,
        notes: data.notes ?? null,
        outcome: data.outcome ?? DEFAULTS.INTERVIEW_OUTCOME,
      })
      .returning();
    return this.toEntity(row);
  }

  async update(id: string, data: UpdateInterviewRoundData): Promise<InterviewRound> {
    const [row] = await this.db
      .update(interviewRound)
      .set({
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.scheduledAt !== undefined ? { scheduledAt: data.scheduledAt } : {}),
        ...(data.completedAt !== undefined ? { completedAt: data.completedAt } : {}),
        ...(data.interviewerName !== undefined ? { interviewerName: data.interviewerName } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.outcome !== undefined ? { outcome: data.outcome } : {}),
        updatedAt: new Date(),
      })
      .where(eq(interviewRound.id, id))
      .returning();
    return this.toEntity(row);
  }

  async updatePushNotificationSentAt(id: string, sentAt: Date): Promise<void> {
    await this.db
      .update(interviewRound)
      .set({ pushNotificationSentAt: sentAt, updatedAt: new Date() })
      .where(eq(interviewRound.id, id));
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(interviewRound).where(eq(interviewRound.id, id));
  }

  private toEntity(row: typeof interviewRound.$inferSelect): InterviewRound {
    return {
      id: row.id,
      applicationId: row.applicationId,
      type: row.type as InterviewRoundType,
      scheduledAt: row.scheduledAt,
      completedAt: row.completedAt,
      interviewerName: row.interviewerName,
      notes: row.notes,
      outcome: row.outcome as InterviewRoundOutcome,
      questionCount: row.questionCount,
      pushNotificationSentAt: row.pushNotificationSentAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
