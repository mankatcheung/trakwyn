/**
 * GraphQL error `extensions.code` values.
 *
 * Lives beside `DomainError` because the two are one vocabulary: every
 * `DomainError` subclass carries one of these codes, and
 * `http/errors/formatError.ts` maps the code to an HTTP status at the
 * boundary. Splitting them would let a code exist with no error that raises
 * it, or an error with a code nothing maps.
 */
export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  VALIDATION: 'VALIDATION',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  /** User hasn't configured their own LLM API key — AI features are unavailable, not a fallback error. */
  AI_NOT_CONFIGURED: 'AI_NOT_CONFIGURED',
  /** The LLM's response wasn't valid JSON, or didn't match the expected shape (JEF-108) — distinct from a genuine AI answer, so callers can tell "couldn't parse" apart from "the model said 0/empty". */
  AI_RESPONSE_INVALID: 'AI_RESPONSE_INVALID',
  /** The key the request would have used has passed its monthly token limit (JEF-258) — distinct from AI_NOT_CONFIGURED, which would wrongly tell someone to add a key they already have. */
  AI_LIMIT_REACHED: 'AI_LIMIT_REACHED',
  /** The user's own LLM provider rejected or failed the call (bad key, quota, outage) — a user-side condition on a BYOK key, not a fault in this server. */
  AI_PROVIDER_ERROR: 'AI_PROVIDER_ERROR',
  /** Session is stale for a 2FA-enabled account attempting a sensitive change — caller must reauthenticate (see `reauthenticate` mutation) and retry. */
  STEP_UP_REQUIRED: 'STEP_UP_REQUIRED',
  /** The user has spent this month's hosted AI credits (JEF-447) — the client offers Pro or their own key. Distinct from AI_LIMIT_REACHED, which is a cap on one of their own keys, and from PLAN_REQUIRED, which is a feature gate. */
  AI_CREDITS_EXHAUSTED: 'AI_CREDITS_EXHAUSTED',
  /** Hosted AI is paused because the day's platform spend budget is used up, or could not be read (JEF-449) — a 503 the user can only wait out, or avoid by using their own key. */
  AI_TEMPORARILY_UNAVAILABLE: 'AI_TEMPORARILY_UNAVAILABLE',
  /** The action needs a solved captcha and the request carried none (JEF-401) — the client shows the widget and retries. */
  CAPTCHA_REQUIRED: 'CAPTCHA_REQUIRED',
  /** The captcha token was sent but the verifier refused it (JEF-401) — expired, reused, or forged. */
  CAPTCHA_FAILED: 'CAPTCHA_FAILED',
  /** The action needs a plan the user is not on (JEF-344) — the client shows an upgrade prompt rather than a failure. Distinct from QUOTA_EXCEEDED, which is a cap on something every plan has. */
  PLAN_REQUIRED: 'PLAN_REQUIRED',
  /** The account's email address is not verified yet (JEF-438) — the client shows the full-page verification reminder rather than a failure. */
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  /** The account is scheduled for deletion (JEF-463) — the client shows the "cancel deletion" screen rather than a failure. */
  ACCOUNT_DELETION_SCHEDULED: 'ACCOUNT_DELETION_SCHEDULED',
  /** A Google Calendar call failed (expired/revoked token, API error) — surfaced from the explicit connect/disconnect flow, not from inline sync, which is fail-open by design. */
  CALENDAR_PROVIDER_ERROR: 'CALENDAR_PROVIDER_ERROR',
} as const;
