import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const user = sqliteTable('User', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('passwordHash'),
  name: text('name'),
  timezone: text('timezone'),
  targetRole: text('targetRole'),
  emailVerifiedAt: integer('emailVerifiedAt', { mode: 'timestamp_ms' }),
  avatarKey: text('avatarKey'),
  weeklyDigestEnabled: integer('weeklyDigestEnabled', { mode: 'boolean' }).notNull().default(true),
  digestFrequency: text('digestFrequency').notNull().default('weekly'),
  lastDigestSentAt: integer('lastDigestSentAt', { mode: 'timestamp_ms' }),
  followUpRemindersEnabled: integer('followUpRemindersEnabled', { mode: 'boolean' })
    .notNull()
    .default(true),
  pushNotificationsEnabled: integer('pushNotificationsEnabled', { mode: 'boolean' })
    .notNull()
    .default(false),
  weeklyApplicationGoal: integer('weeklyApplicationGoal').notNull().default(5),
  applicationCount: integer('applicationCount').notNull().default(0),
  totpSecret: text('totpSecret'),
  totpEnabled: integer('totpEnabled', { mode: 'boolean' }).notNull().default(false),
  /**
   * Which of the user's configured LlmApiKey rows (see below) is used for
   * automatic AI features (cover letter, JD parsing, resume match) — the
   * assistant chooses its own provider per-conversation instead.
   */
  defaultLlmProvider: text('defaultLlmProvider'),
  /** User-authored instruction spliced into the system prompt for AI-generated text (cover letters, chat assistant). */
  customAiPrompt: text('customAiPrompt'),
  /**
   * Opt-in (JEF-249): let cover letter generation read a small, recent slice
   * of notes and cover letters from the user's *other* applications, to
   * match voice/tone. Off by default — it reaches into application data the
   * user didn't ask about when generating a single letter.
   */
  useCrossApplicationContext: integer('useCrossApplicationContext', { mode: 'boolean' })
    .notNull()
    .default(false),
  /**
   * When a key hits its monthly token limit (JEF-258), fall through to the
   * user's next key that still has headroom instead of stopping.
   *
   * Off by default: spending on a provider the user did not pick for this
   * task is the surprising behaviour, so it is opted into rather than out of.
   */
  llmFallbackWhenLimited: integer('llmFallbackWhenLimited', { mode: 'boolean' })
    .notNull()
    .default(false),
  /** Secondary email for account recovery when primary inbox is inaccessible. */
  backupEmail: text('backupEmail'),
  /** When the backup email was verified; null until verification completes. */
  backupEmailVerifiedAt: integer('backupEmailVerifiedAt', { mode: 'timestamp_ms' }),
  /** When the user dismissed the dashboard onboarding checklist (JEF-333); null until dismissed. */
  onboardingChecklistDismissedAt: integer('onboardingChecklistDismissedAt', {
    mode: 'timestamp_ms',
  }),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
});
