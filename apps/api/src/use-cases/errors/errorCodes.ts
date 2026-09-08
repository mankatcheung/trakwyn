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
} as const;
