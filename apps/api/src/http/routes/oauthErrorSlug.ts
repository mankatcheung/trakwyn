import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

/**
 * Every failure the OAuth callback can report, as a closed set of slugs —
 * never forward a raw `err.message` (or any other free-text detail) into the
 * query string instead. An unexpected throw's message can contain upstream
 * status codes, provider error slugs, or this deployment's own environment
 * variable names, and the query string ends up in the URL bar, browser
 * history, and Referer header. Only a value from this list crosses that
 * boundary; the client translates it into user-facing text.
 */
export const OAUTH_ERROR = {
  /** The user pressed Cancel at the provider. Not a fault. */
  ACCESS_DENIED: 'access_denied',
  MISSING_CODE: 'missing_code',
  INVALID_STATE: 'invalid_state',
  PROVIDER_MISMATCH: 'provider_mismatch',
  MISSING_USER: 'missing_user',
  /** Linking: this provider account already belongs to someone else. */
  ALREADY_LINKED: 'already_linked',
  /** Signing up: the email is taken, and auto-linking would be a takeover vector. */
  EMAIL_IN_USE: 'email_in_use',
  /** Signing up: the provider shared no verified email. */
  EMAIL_NOT_VERIFIED: 'email_not_verified',
  /** Signing in: the link exists but its user does not. */
  ACCOUNT_NOT_FOUND: 'account_not_found',
  /**
   * Step-up (JEF-463): the provider did not prove a fresh sign-in to the
   * account linked to this user, or the session ended meanwhile.
   */
  REAUTH_FAILED: 'reauth_failed',
  /** Anything else. The real error is logged, never shown. */
  FAILED: 'failed',
} as const;

export type OAuthErrorSlug = (typeof OAUTH_ERROR)[keyof typeof OAUTH_ERROR];

function codeOf(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

/**
 * Maps a thrown error to a slug, by `code` rather than by message — matching
 * on prose would break the moment someone rewords a use case.
 *
 * The same code means different things in the two flows (a CONFLICT while
 * linking is not a CONFLICT while signing up), so the caller says which flow
 * it is in rather than this guessing.
 */
export function loginErrorSlug(error: unknown): OAuthErrorSlug {
  switch (codeOf(error)) {
    case ERROR_CODES.CONFLICT:
      return OAUTH_ERROR.EMAIL_IN_USE;
    case ERROR_CODES.VALIDATION:
      return OAUTH_ERROR.EMAIL_NOT_VERIFIED;
    case ERROR_CODES.NOT_FOUND:
      return OAUTH_ERROR.ACCOUNT_NOT_FOUND;
    default:
      return OAUTH_ERROR.FAILED;
  }
}

export function reauthErrorSlug(error: unknown): OAuthErrorSlug {
  return codeOf(error) === ERROR_CODES.UNAUTHORIZED
    ? OAUTH_ERROR.REAUTH_FAILED
    : OAUTH_ERROR.FAILED;
}

export function linkErrorSlug(error: unknown): OAuthErrorSlug {
  return codeOf(error) === ERROR_CODES.CONFLICT ? OAUTH_ERROR.ALREADY_LINKED : OAUTH_ERROR.FAILED;
}

/**
 * The provider's own `error` param is attacker-influencable text, so it is
 * allow-listed rather than echoed. Only "the user declined" is distinct enough
 * to be worth its own message; every other provider error is a failure the
 * user can do nothing about.
 */
export function providerErrorSlug(error: string): OAuthErrorSlug {
  return error === OAUTH_ERROR.ACCESS_DENIED ? OAUTH_ERROR.ACCESS_DENIED : OAUTH_ERROR.FAILED;
}
