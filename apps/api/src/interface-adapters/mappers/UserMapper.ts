import type { User } from '#src/domain/user/User.js';
import type { OnboardingGoal } from '#src/domain/user/OnboardingGoal.js';
import type { AiCreditStanding, IAiCreditService } from '#src/use-cases/ports/IAiCreditService.js';
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
  phone: string | null;
  location: string | null;
  profileLinks: string[];
  avatarUrl: string | null;
  defaultLlmProvider: string | null;
  customAiPrompt: string | null;
  useCrossApplicationContext: boolean;
  llmFallbackWhenLimited: boolean;
  aiSource: string;
  backupEmail: string | null;
  backupEmailVerifiedAt: Date | null;
  onboardingChecklistDismissedAt: Date | null;
  onboardingGoals: OnboardingGoal[];
  onboardingCompletedAt: Date | null;
  storageUsedBytes: number;
  storageLimitBytes: number;
  /** This month's hosted AI credits (JEF-447). */
  aiCredits: AiCreditStanding;
  hasPassword: boolean;
  /** When the account will be deleted (JEF-463); null unless scheduled. */
  deletionScheduledAt: Date | null;
}

export class UserMapper {
  private readonly entitlementService: IEntitlementService;
  private readonly aiCreditService: IAiCreditService;
  private readonly emailVerificationRequired: boolean;

  constructor({
    entitlementService,
    aiCreditService,
    emailVerificationRequired = true,
  }: {
    entitlementService: IEntitlementService;
    aiCreditService: IAiCreditService;
    emailVerificationRequired?: boolean;
  }) {
    this.entitlementService = entitlementService;
    this.aiCreditService = aiCreditService;
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
      phone: user.phone,
      location: user.location,
      profileLinks: user.profileLinks ?? [],
      avatarUrl,
      defaultLlmProvider: user.defaultLlmProvider,
      customAiPrompt: user.customAiPrompt,
      useCrossApplicationContext: user.useCrossApplicationContext,
      llmFallbackWhenLimited: user.llmFallbackWhenLimited,
      aiSource: user.aiSource,
      backupEmail: user.backupEmail,
      backupEmailVerifiedAt: user.backupEmailVerifiedAt,
      onboardingChecklistDismissedAt: user.onboardingChecklistDismissedAt,
      onboardingGoals: user.onboardingGoals,
      onboardingCompletedAt: user.onboardingCompletedAt,
      storageUsedBytes: user.documentBytes,
      storageLimitBytes: this.entitlementService.forUser(user).limits.documentBytes,
      aiCredits: this.aiCreditService.standing(user),
      hasPassword: user.passwordHash !== null,
      deletionScheduledAt: user.deletionScheduledAt,
    };
  }
}
