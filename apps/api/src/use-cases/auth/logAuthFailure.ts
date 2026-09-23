import type { AUTH_FAILURE_EVENTS } from '#src/use-cases/constants.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';

/**
 * Why a sign-in was refused, as a category (JEF-354).
 *
 * An unknown email and a wrong password are deliberately the same
 * `invalid_credentials`: telling them apart in a log would make the log an
 * account-enumeration oracle if it were ever exposed, and a burst is already
 * visible as rate-limit lines (JEF-350). `no_password` is an OAuth-only
 * account; `invalid_code` is a wrong TOTP or backup code after the password
 * was accepted.
 */
export type AuthFailureReason = 'invalid_credentials' | 'no_password' | 'invalid_code';

type AuthFailureEvent = (typeof AUTH_FAILURE_EVENTS)[keyof typeof AUTH_FAILURE_EVENTS];

/**
 * Logs one refused sign-in at `warn`. The submitted email is never passed in,
 * so it cannot reach the line. `userId` is only given once the password has
 * been accepted — a user id on a password failure would reveal that the
 * account exists, which `invalid_credentials` is there to hide.
 */
export function logAuthFailure(
  logger: ILogger,
  event: AuthFailureEvent,
  reason: AuthFailureReason,
  userId?: string,
): void {
  logger.warn('Authentication failed', undefined, { event, reason, userId });
}
