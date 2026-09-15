import type { User } from '#src/domain/user/User.js';

export interface UserDTO {
  id: string;
  email: string;
  name: string | null;
  timezone: string | null;
  targetRole: string | null;
  avatarUrl: string | null;
  defaultLlmProvider: string | null;
  customAiPrompt: string | null;
  useCrossApplicationContext: boolean;
  llmFallbackWhenLimited: boolean;
  backupEmail: string | null;
  backupEmailVerifiedAt: Date | null;
  onboardingChecklistDismissedAt: Date | null;
}

export class UserMapper {
  toDTO(user: User, avatarUrl: string | null): UserDTO {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      timezone: user.timezone,
      targetRole: user.targetRole,
      avatarUrl,
      defaultLlmProvider: user.defaultLlmProvider,
      customAiPrompt: user.customAiPrompt,
      useCrossApplicationContext: user.useCrossApplicationContext,
      llmFallbackWhenLimited: user.llmFallbackWhenLimited,
      backupEmail: user.backupEmail,
      backupEmailVerifiedAt: user.backupEmailVerifiedAt,
      onboardingChecklistDismissedAt: user.onboardingChecklistDismissedAt,
    };
  }
}
