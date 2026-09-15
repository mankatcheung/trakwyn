import type { User } from '#src/domain/user/User.js';

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByBackupEmail(email: string): Promise<User | null>;
  findAll(): Promise<User[]>;
  create(data: {
    id: string;
    email: string;
    passwordHash?: string | null;
    name?: string | null;
    emailVerifiedAt?: Date | null;
  }): Promise<User>;
  update(
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
  ): Promise<User>;
  delete(id: string): Promise<void>;
  updateLastDigestSentAt(id: string, sentAt: Date): Promise<void>;
}
