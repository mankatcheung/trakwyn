import { ENV, NODE_ENV } from '#src/infrastructure/config/constants.js';

/**
 * `AUTO_VERIFY_EMAIL` when set to `true` or `false`, else on everywhere except
 * production (JEF-438). Anything else set is a mistake worth failing on: a typo
 * must not quietly leave production sign-ups verified.
 */
export function resolveAutoVerifyEmail(): boolean {
  const configured = process.env[ENV.AUTO_VERIFY_EMAIL]?.trim().toLowerCase();
  if (!configured) return process.env[ENV.NODE_ENV] !== NODE_ENV.PRODUCTION;
  if (configured === 'true') return true;
  if (configured === 'false') return false;
  throw new Error(`${ENV.AUTO_VERIFY_EMAIL} must be "true" or "false", got "${configured}"`);
}
