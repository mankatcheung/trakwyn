import { and, eq, asc, lte, sql } from 'drizzle-orm';
import type { DrizzleDb, DrizzleClient } from '../client.js';
import { user } from '../schema.js';
import type { User } from '#src/domain/user/User.js';
import type { Plan, PlanSource } from '#src/domain/plan/Plan.js';
import type { AiSource } from '#src/domain/user/AiSource.js';
import type { OnboardingGoal } from '#src/domain/user/OnboardingGoal.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import { getClient } from '../transactionContext.js';

export class DrizzleUserRepository implements IUserRepository {
  private readonly database: DrizzleDb;

  constructor({ db }: { db: DrizzleDb }) {
    this.database = db;
  }

  private get db(): DrizzleClient {
    return getClient(this.database);
  }

  async findById(id: string): Promise<User | null> {
    const [row] = await this.db.select().from(user).where(eq(user.id, id)).limit(1);
    return row ? this.toEntity(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const [row] = await this.db.select().from(user).where(eq(user.email, email)).limit(1);
    return row ? this.toEntity(row) : null;
  }

  async findByBackupEmail(email: string): Promise<User | null> {
    const [row] = await this.db.select().from(user).where(eq(user.backupEmail, email)).limit(1);
    return row ? this.toEntity(row) : null;
  }

  async findByBillingCustomerId(customerId: string): Promise<User | null> {
    const [row] = await this.db
      .select()
      .from(user)
      .where(eq(user.billingCustomerId, customerId))
      .limit(1);
    return row ? this.toEntity(row) : null;
  }

  async findAll(): Promise<User[]> {
    const rows = await this.db.select().from(user).orderBy(asc(user.createdAt));
    return rows.map((r) => this.toEntity(r));
  }

  async findScheduledForDeletionBefore(cutoff: Date): Promise<User[]> {
    const rows = await this.db
      .select()
      .from(user)
      .where(lte(user.deletionScheduledAt, cutoff))
      .orderBy(asc(user.deletionScheduledAt));
    return rows.map((r) => this.toEntity(r));
  }

  async create(data: {
    id: string;
    email: string;
    passwordHash?: string | null;
    name?: string | null;
    emailVerifiedAt?: Date | null;
  }): Promise<User> {
    const [row] = await this.db.insert(user).values(data).returning();
    return this.toEntity(row);
  }

  async update(
    id: string,
    data: {
      email?: string;
      passwordHash?: string | null;
      name?: string | null;
      timezone?: string | null;
      targetRole?: string | null;
      emailVerifiedAt?: Date | null;
      avatarKey?: string | null;
      weeklyDigestEnabled?: boolean;
      digestFrequency?: 'daily' | 'weekly' | 'off';
      followUpRemindersEnabled?: boolean;
      pushNotificationsEnabled?: boolean;
      weeklyApplicationGoal?: number;
      totpSecret?: string | null;
      totpEnabled?: boolean;
      defaultLlmProvider?: string | null;
      customAiPrompt?: string | null;
      useCrossApplicationContext?: boolean;
      llmFallbackWhenLimited?: boolean;
      aiSource?: AiSource;
      aiProviderOrder?: string[] | null;
      backupEmail?: string | null;
      backupEmailVerifiedAt?: Date | null;
      onboardingChecklistDismissedAt?: Date | null;
      onboardingGoals?: OnboardingGoal[];
      onboardingCompletedAt?: Date | null;
      plan?: Plan;
      planExpiresAt?: Date | null;
      planSource?: PlanSource | null;
      billingCustomerId?: string | null;
      billingSubscriptionId?: string | null;
      deletionScheduledAt?: Date | null;
    },
  ): Promise<User> {
    const [row] = await this.db
      .update(user)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(user.id, id))
      .returning();
    return this.toEntity(row);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(user).where(eq(user.id, id));
  }

  async reserveAiCredits(
    userId: string,
    credits: number,
    limit: number,
    periodStart: Date,
  ): Promise<boolean> {
    // One conditional UPDATE, so two calls at 29/30 cannot both pass. A counter
    // from an earlier period reads as zero and is replaced in the same statement.
    const stale = sql`(${user.aiCreditsPeriodStart} is null or ${user.aiCreditsPeriodStart} < ${periodStart})`;
    const next = sql`case when ${stale} then ${credits}::int else ${user.aiCreditsUsed} + ${credits}::int end`;
    const [reserved] = await this.db
      .update(user)
      .set({ aiCreditsUsed: next, aiCreditsPeriodStart: periodStart })
      .where(and(eq(user.id, userId), sql`${next} <= ${limit}::int`))
      .returning({ id: user.id });
    return !!reserved;
  }

  async releaseAiCredits(userId: string, credits: number, periodStart: Date): Promise<void> {
    // Only inside the period it was charged in: a refund must not eat into the
    // next month's budget.
    await this.db
      .update(user)
      .set({ aiCreditsUsed: sql`greatest(${user.aiCreditsUsed} - ${credits}::int, 0)` })
      .where(and(eq(user.id, userId), eq(user.aiCreditsPeriodStart, periodStart)));
  }

  async updateLastDigestSentAt(id: string, sentAt: Date): Promise<void> {
    await this.db.update(user).set({ lastDigestSentAt: sentAt }).where(eq(user.id, id));
  }

  private toEntity(row: typeof user.$inferSelect): User {
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      name: row.name,
      timezone: row.timezone,
      targetRole: row.targetRole,
      emailVerifiedAt: row.emailVerifiedAt,
      avatarKey: row.avatarKey,
      weeklyDigestEnabled: row.weeklyDigestEnabled,
      digestFrequency: row.digestFrequency as User['digestFrequency'],
      lastDigestSentAt: row.lastDigestSentAt,
      followUpRemindersEnabled: row.followUpRemindersEnabled,
      pushNotificationsEnabled: row.pushNotificationsEnabled,
      weeklyApplicationGoal: row.weeklyApplicationGoal,
      applicationCount: row.applicationCount,
      documentBytes: row.documentBytes,
      aiCreditsUsed: row.aiCreditsUsed,
      aiCreditsPeriodStart: row.aiCreditsPeriodStart,
      plan: row.plan as Plan,
      planExpiresAt: row.planExpiresAt,
      planSource: row.planSource as PlanSource | null,
      billingCustomerId: row.billingCustomerId,
      billingSubscriptionId: row.billingSubscriptionId,
      totpSecret: row.totpSecret,
      totpEnabled: row.totpEnabled,
      defaultLlmProvider: row.defaultLlmProvider,
      customAiPrompt: row.customAiPrompt,
      useCrossApplicationContext: row.useCrossApplicationContext,
      llmFallbackWhenLimited: row.llmFallbackWhenLimited,
      aiSource: row.aiSource as AiSource,
      aiProviderOrder: row.aiProviderOrder,
      backupEmail: row.backupEmail,
      backupEmailVerifiedAt: row.backupEmailVerifiedAt,
      onboardingChecklistDismissedAt: row.onboardingChecklistDismissedAt,
      onboardingGoals: row.onboardingGoals as OnboardingGoal[],
      onboardingCompletedAt: row.onboardingCompletedAt,
      deletionScheduledAt: row.deletionScheduledAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
