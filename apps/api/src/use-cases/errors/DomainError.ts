import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

/**
 * How a use case says something went wrong.
 *
 * Carries a code and nothing else. The equivalents under `http/errors` also
 * carry an HTTP status, which is why importing those here put `404` inside a
 * business rule — a use case has no opinion on how a transport reports it.
 *
 * `http/errors/formatError` maps the code to a status at the boundary, which
 * is the only place that knows there is a boundary. Adding a case here means
 * adding one to `fromCodedError` too, or it degrades to a 500.
 */
export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** The thing asked for does not exist, or does not belong to this user. */
export class NotFoundError extends DomainError {
  constructor(resource = 'Resource') {
    // Callers pass either a noun ("Skill") or a whole sentence, and both read
    // the same way to whoever ends up seeing it.
    const message = /not found$/i.test(resource) ? resource : `${resource} not found`;
    super(message, ERROR_CODES.NOT_FOUND);
  }
}

/** The thing exists; this user may not do that to it. */
export class ForbiddenError extends DomainError {
  constructor(message = 'Forbidden') {
    super(message, ERROR_CODES.FORBIDDEN);
  }
}

/** The request conflicts with something already there. */
export class ConflictError extends DomainError {
  constructor(message = 'Conflict') {
    super(message, ERROR_CODES.CONFLICT);
  }
}

/** The requested resource quota has been reached. */
export class QuotaExceededError extends DomainError {
  constructor(message: string) {
    super(message, ERROR_CODES.QUOTA_EXCEEDED);
  }
}

/** The caller is not authenticated, or their credential no longer stands. */
export class UnauthorizedError extends DomainError {
  constructor(message = 'Unauthorized') {
    super(message, ERROR_CODES.UNAUTHORIZED);
  }
}

/** The input is malformed or fails a rule the caller can fix. */
export class ValidationError extends DomainError {
  constructor(message = 'Invalid input') {
    super(message, ERROR_CODES.VALIDATION);
  }
}

/** The caller is doing something too often. */
export class RateLimitedError extends DomainError {
  constructor(message = 'Too many requests') {
    super(message, ERROR_CODES.RATE_LIMITED);
  }
}

/** The action needs a fresh authentication before it will be allowed. */
export class StepUpRequiredError extends DomainError {
  constructor(message = 'Re-authentication required') {
    super(message, ERROR_CODES.STEP_UP_REQUIRED);
  }
}

/** No email matches. Distinct from NotFoundError so the sign-in page can say so. */
export class UserNotFoundError extends DomainError {
  constructor(message = 'No account found with this email') {
    super(message, ERROR_CODES.USER_NOT_FOUND);
  }
}

/** The user has not configured an AI provider. */
export class AiNotConfiguredError extends DomainError {
  constructor(message = 'AI is not configured') {
    super(message, ERROR_CODES.AI_NOT_CONFIGURED);
  }
}

/**
 * The key this request would have used has spent its monthly token limit.
 *
 * Separate from `AiNotConfiguredError` because the remedy is the opposite:
 * the user has a key, and telling them to add one would be wrong. Carries
 * the provider and when the limit resets so the client can say which key
 * stopped and for how long.
 */
export class LlmLimitReachedError extends DomainError {
  constructor(
    readonly provider: string,
    readonly resetsAt: Date,
    message = 'This API key has reached its monthly token limit',
  ) {
    super(message, ERROR_CODES.AI_LIMIT_REACHED);
  }
}

/**
 * How the user's own provider failed, coarse enough to act on: `auth` means
 * fix the key, `quota`/`rate_limited` mean wait or pay, `bad_request` means
 * the model or request shape, `unavailable` means try later.
 */
export type LlmProviderErrorKind =
  'auth' | 'quota' | 'rate_limited' | 'bad_request' | 'unavailable' | 'unreachable';

/**
 * What a person reads for each `LlmProviderErrorKind` — the message every
 * client shows as-is, so it is written for the settings page and the chat
 * pane, not the log.
 */
export const LLM_PROVIDER_FAILURE_MESSAGES: Record<LlmProviderErrorKind, string> = {
  auth: 'The provider rejected this API key — check it in Settings and try again',
  quota: 'The provider reports this key is out of credit',
  rate_limited: 'The provider is rate-limiting this key — wait a moment and try again',
  bad_request: 'The provider rejected the request — check the model name in Settings',
  unavailable: 'The provider is unavailable right now — try again later',
  unreachable: 'Could not reach the provider — check the base URL and try again',
};

/**
 * The user's LLM provider refused or failed the call.
 *
 * A bare `Error` here reached clients as "Something went wrong" with a 500
 * and was logged as a server fault, for what is a revoked key or an exhausted
 * quota on a key this server does not own. The `message` is the per-kind
 * copy above plus, when known, which provider and status ("… (Anthropic
 * error 401)"), since web and mobile show it verbatim. What the provider
 * actually said — a short, truncated excerpt, never its whole body — goes
 * in `detail` for logs, not in front of a user.
 */
export class LlmProviderError extends DomainError {
  readonly status: number | null;
  readonly detail: string | null;

  constructor(
    readonly kind: LlmProviderErrorKind = 'unavailable',
    options: { provider?: string; status?: number | null; detail?: string | null } = {},
  ) {
    const where =
      options.provider && options.status
        ? ` (${options.provider} error ${options.status})`
        : options.provider
          ? ` (${options.provider})`
          : '';
    super(`${LLM_PROVIDER_FAILURE_MESSAGES[kind]}${where}`, ERROR_CODES.AI_PROVIDER_ERROR);
    this.status = options.status ?? null;
    this.detail = options.detail ?? null;
  }
}

/** The model replied with something unusable. */
export class AiResponseInvalidError extends DomainError {
  constructor(message = 'The AI response could not be used') {
    super(message, ERROR_CODES.AI_RESPONSE_INVALID);
  }
}

/** A dependency this action needs is unavailable. */
export class ServiceUnavailableError extends DomainError {
  constructor(message = 'Service unavailable') {
    super(message, ERROR_CODES.SERVICE_UNAVAILABLE);
  }
}
