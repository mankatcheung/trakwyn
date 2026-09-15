import { eq, asc } from 'drizzle-orm';
import type { DrizzleDb, DrizzleClient } from '../client.js';
import { user } from '../schema.js';
import type { User } from '#src/domain/user/User.js';
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

  async findAll(): Promise<User[]> {
    const rows = await this.db.select().from(user).orderBy(asc(user.createdAt));
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
      passwordHash?: string;
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
      backupEmail?: string | null;
      backupEmailVerifiedAt?: Date | null;
      onboardingChecklistDismissedAt?: Date | null;
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
      totpSecret: row.totpSecret,
      totpEnabled: row.totpEnabled,
      defaultLlmProvider: row.defaultLlmProvider,
      customAiPrompt: row.customAiPrompt,
      useCrossApplicationContext: row.useCrossApplicationContext,
      llmFallbackWhenLimited: row.llmFallbackWhenLimited,
      backupEmail: row.backupEmail,
      backupEmailVerifiedAt: row.backupEmailVerifiedAt,
      onboardingChecklistDismissedAt: row.onboardingChecklistDismissedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
