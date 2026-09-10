import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    const message = /not found$/i.test(resource) ? resource : `${resource} not found`;
    super(message, 404, ERROR_CODES.NOT_FOUND);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(message, 409, ERROR_CODES.CONFLICT);
  }
}

export class QuotaExceededError extends AppError {
  constructor(message = 'Resource quota exceeded') {
    super(message, 409, ERROR_CODES.QUOTA_EXCEEDED);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, ERROR_CODES.UNAUTHORIZED);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, ERROR_CODES.FORBIDDEN);
  }
}

export class UserNotFoundError extends AppError {
  constructor(message = 'No account found with this email') {
    super(message, 404, ERROR_CODES.USER_NOT_FOUND);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Invalid input') {
    super(message, 400, ERROR_CODES.VALIDATION);
  }
}

export class RateLimitedError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429, ERROR_CODES.RATE_LIMITED);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service unavailable') {
    super(message, 503, ERROR_CODES.SERVICE_UNAVAILABLE);
  }
}

export class AiNotConfiguredError extends AppError {
  constructor(message = 'Add your AI API key in Settings to use this feature') {
    super(message, 400, ERROR_CODES.AI_NOT_CONFIGURED);
  }
}

export class AiResponseInvalidError extends AppError {
  constructor(message = "The AI's response couldn't be understood — please try again") {
    super(message, 502, ERROR_CODES.AI_RESPONSE_INVALID);
  }
}

export class StepUpRequiredError extends AppError {
  constructor(message = 'Please verify your identity again to continue') {
    super(message, 403, ERROR_CODES.STEP_UP_REQUIRED);
  }
}

/**
 * 429: the user has spent this key's monthly allowance. Same status as a
 * rate limit — the request is well-formed and would succeed later (or now,
 * with a higher limit) — but a distinct code, so the client can offer to
 * raise the limit rather than tell them to slow down.
 */
export class LlmLimitReachedAppError extends AppError {
  constructor(message = 'This API key has reached its monthly token limit') {
    super(message, 429, ERROR_CODES.AI_LIMIT_REACHED);
  }
}

/**
 * 502: the user's own provider failed. Not a 500 — nothing in this server
 * went wrong — and not a 4xx either, since the request to us was fine; the
 * gateway status is the honest one, and the code tells the client which
 * remedy to offer.
 */
export class AiProviderAppError extends AppError {
  constructor(message = 'The AI provider could not complete the request') {
    super(message, 502, ERROR_CODES.AI_PROVIDER_ERROR);
  }
}

export function fromCodedError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof Error) {
    const code = (err as Error & { code?: string }).code;
    switch (code) {
      case ERROR_CODES.NOT_FOUND:
        return new NotFoundError(err.message);
      case ERROR_CODES.USER_NOT_FOUND:
        // Was missing, so LoginUseCase's "No account found with this email"
        // fell through to the 500 default and reached the sign-in page as
        // "Internal server error" — even though formatError already listed
        // this code as one clients are expected to see.
        return new UserNotFoundError(err.message);
      case ERROR_CODES.CONFLICT:
        return new ConflictError(err.message);
      case ERROR_CODES.QUOTA_EXCEEDED:
        return new QuotaExceededError(err.message);
      case ERROR_CODES.UNAUTHORIZED:
        return new UnauthorizedError(err.message);
      case ERROR_CODES.FORBIDDEN:
        return new ForbiddenError(err.message);
      case ERROR_CODES.VALIDATION:
        return new ValidationError(err.message);
      case ERROR_CODES.RATE_LIMITED:
        return new RateLimitedError(err.message);
      case ERROR_CODES.SERVICE_UNAVAILABLE:
        return new ServiceUnavailableError(err.message);
      case ERROR_CODES.AI_NOT_CONFIGURED:
        return new AiNotConfiguredError(err.message);
      case ERROR_CODES.AI_LIMIT_REACHED:
        return new LlmLimitReachedAppError(err.message);
      case ERROR_CODES.AI_RESPONSE_INVALID:
        return new AiResponseInvalidError(err.message);
      case ERROR_CODES.AI_PROVIDER_ERROR:
        return new AiProviderAppError(err.message);
      case ERROR_CODES.STEP_UP_REQUIRED:
        return new StepUpRequiredError(err.message);
    }
  }
  return new AppError('Internal server error', 500, ERROR_CODES.INTERNAL_ERROR);
}
