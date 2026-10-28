import type { Plan, PlanSource } from '#src/domain/plan/Plan.js';
import type { OnboardingGoal } from '#src/domain/user/OnboardingGoal.js';

export interface User {
  id: string;
  email: string;
  /** Null for accounts created via OAuth sign-up that never set a password. */
  passwordHash: string | null;
  name: string | null;
  timezone: string | null;
  targetRole: string | null;
  emailVerifiedAt: Date | null;
  avatarKey: string | null;
  weeklyDigestEnabled: boolean;
  digestFrequency: 'daily' | 'weekly' | 'off';
  lastDigestSentAt: Date | null;
  followUpRemindersEnabled: boolean;
  pushNotificationsEnabled: boolean;
  weeklyApplicationGoal: number;
  /** Applications owned, Trash included, counted against the application cap. */
  applicationCount: number;
  /** Bytes of documents stored, counted against the storage limit (JEF-425). */
  documentBytes: number;
  /** The plan the user is on (JEF-344). Use `resolveEntitlements` for what it allows: an expired Pro plan reads as Free there. */
  plan: Plan;
  /** When a Pro pass or trial ends; null for Free and for an active subscription. */
  planExpiresAt: Date | null;
  planSource: PlanSource | null;
  /** The payment provider's customer id (JEF-426); null until the first payment. */
  billingCustomerId: string | null;
  /** The active subscription at the payment provider (JEF-426); null for a pass or no payment. */
  billingSubscriptionId: string | null;
  totpSecret: string | null;
  totpEnabled: boolean;
  /** Which of the user's configured LlmApiKey providers is used for automatic AI features. */
  defaultLlmProvider: string | null;
  /** User-authored instruction spliced into the system prompt for AI-generated text (cover letters, chat assistant). */
  customAiPrompt: string | null;
  /** Opt-in (JEF-249): feed a small, recent slice of the user's other applications' notes/cover letters into cover letter generation. */
  useCrossApplicationContext: boolean;
  /** Fall through to another key when one hits its monthly limit (JEF-258). */
  llmFallbackWhenLimited: boolean;
  /** Secondary email for account recovery when primary inbox is inaccessible. */
  backupEmail: string | null;
  /** When the backup email was verified; null until verification completes. */
  backupEmailVerifiedAt: Date | null;
  /** When the user dismissed the dashboard onboarding checklist (JEF-333); null until dismissed. */
  onboardingChecklistDismissedAt: Date | null;
  /** What the user picked in the welcome flow (JEF-460); empty when skipped or never asked. */
  onboardingGoals: OnboardingGoal[];
  /** When the user finished or skipped the welcome flow (JEF-460); null until then, which sends them to it. */
  onboardingCompletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
