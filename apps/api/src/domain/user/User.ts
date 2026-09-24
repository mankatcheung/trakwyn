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
  createdAt: Date;
  updatedAt: Date;
}
