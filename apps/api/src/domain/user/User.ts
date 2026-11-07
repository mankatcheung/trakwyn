import type { Plan, PlanSource } from '#src/domain/plan/Plan.js';
import type { AiSource } from '#src/domain/user/AiSource.js';
import type { OnboardingGoal } from '#src/domain/user/OnboardingGoal.js';

export interface User {
  id: string;
  email: string;
  /** Null for accounts created via OAuth sign-up that never set a password. */
  passwordHash: string | null;
  name: string | null;
  timezone: string | null;
  targetRole: string | null;
  /** Contact details for the resume header (JEF-527); null until set. */
  phone: string | null;
  location: string | null;
  /** LinkedIn, portfolio, GitHub and the like, as https URLs; null until set. */
  profileLinks: string[] | null;
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
  /** Hosted AI credits spent in the period starting at `aiCreditsPeriodStart` (JEF-447). Read through `creditsUsedIn`, never raw: it is stale once the month turns. */
  aiCreditsUsed: number;
  /** Start (UTC month) of the period `aiCreditsUsed` counts; null before the first hosted call. */
  aiCreditsPeriodStart: Date | null;
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
  /** Which key AI calls run on: the user's own, Trakwyn AI, or whichever is set (JEF-446). */
  aiSource: AiSource;
  /** Fall through to another key when one hits its monthly limit (JEF-258). */
  llmFallbackWhenLimited: boolean;
  /**
   * The AI providers to try, first to last (JEF-503): `trakwyn` and/or the ids of
   * the user's own keys; null until the user sets one. Read it through
   * `effectiveAiProviderOrder`, which derives the order from the three fields above
   * when this is null.
   */
  aiProviderOrder: string[] | null;
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
  /**
   * When the account will be purged (JEF-463); null unless the user confirmed a
   * deletion and has not cancelled it. While set, the account may only cancel.
   */
  deletionScheduledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
