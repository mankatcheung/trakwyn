import { ENV } from '#src/infrastructure/config/constants.js';

/**
 * The email-verification wall's kill switch (JEF-438). On unless
 * `EMAIL_VERIFICATION_REQUIRED` is `false`.
 *
 * Only the exact word turns it off. An unrecognised value such as `0` or a
 * typo keeps the wall up rather than throwing: this is read on every
 * authenticated request, so a throw would fail them all, and a lever for an
 * emergency should not be able to cause one.
 */
export function resolveEmailVerificationRequired(): boolean {
  return process.env[ENV.EMAIL_VERIFICATION_REQUIRED]?.trim().toLowerCase() !== 'false';
}
