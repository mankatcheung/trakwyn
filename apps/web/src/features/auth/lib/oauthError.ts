/**
 * Turns the `oauthError` slug the API redirects with into copy.
 *
 * The API sends a value from a closed set and never a message, so nothing it
 * reports can carry internal detail into the page (JEF-203). Translating that
 * set is this module's whole job.
 *
 * An unrecognised slug falls back to the generic message rather than being
 * printed: a newer API reporting a case this build has no copy for should read
 * as a plain failure, not leak an identifier into the UI — which is the shape
 * of the bug this replaced.
 */
const SLUG_KEYS: Record<string, string> = {
  access_denied: 'oauthError.accessDenied',
  missing_code: 'oauthError.failed',
  invalid_state: 'oauthError.invalidState',
  provider_mismatch: 'oauthError.invalidState',
  missing_user: 'oauthError.failed',
  already_linked: 'oauthError.alreadyLinked',
  email_in_use: 'oauthError.emailInUse',
  email_not_verified: 'oauthError.emailNotVerified',
  account_not_found: 'oauthError.accountNotFound',
  failed: 'oauthError.failed',
};

export function oauthErrorKey(slug: string): string {
  return SLUG_KEYS[slug] ?? 'oauthError.failed';
}
