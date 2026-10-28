import type { User } from '#src/domain/user/User.js';
import type { IEntitlementService } from '#src/use-cases/ports/IEntitlementService.js';

export interface UserDTO {
  id: string;
  email: string;
  /**
   * False until the address is verified (JEF-438); clients show the verification wall. True for
   * everyone while the wall is switched off, so it means "may use the app", not strictly "proved".
   */
  emailVerified: boolean;
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
  storageUsedBytes: number;
  storageLimitBytes: number;
  hasPassword: boolean;
  /** When the account will be deleted (JEF-463); null unless scheduled. */
  deletionScheduledAt: Date | null;
}

export class UserMapper {
  private readonly entitlementService: IEntitlementService;
  private readonly emailVerificationRequired: boolean;

  constructor({
    entitlementService,
    emailVerificationRequired = true,
  }: {
    entitlementService: IEntitlementService;
    emailVerificationRequired?: boolean;
  }) {
    this.entitlementService = entitlementService;
    this.emailVerificationRequired = emailVerificationRequired;
  }

  toDTO(user: User, avatarUrl: string | null): UserDTO {
    return {
      id: user.id,
      email: user.email,
      emailVerified: !this.emailVerificationRequired || user.emailVerifiedAt !== null,
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
      storageUsedBytes: user.documentBytes,
      storageLimitBytes: this.entitlementService.forUser(user).limits.documentBytes,
      hasPassword: user.passwordHash !== null,
      deletionScheduledAt: user.deletionScheduledAt,
    };
  }
}
