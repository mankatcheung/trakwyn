import i18n from '../../i18n';

/**
 * Turns the `oauthError` slug the API's callback hands back through the
 * trakwyn://oauth-callback deep link into copy — mirrors apps/web's
 * oauthError.ts.
 *
 * The API sends a value from a closed set and never a free-text message
 * (JEF-203), so an unrecognised slug falls back to the generic line rather
 * than being printed directly.
 */
const SLUG_KEYS: Record<string, string> = {
  access_denied: 'errors.oauthCancelled',
  missing_code: 'errors.signInFailed',
  invalid_state: 'errors.oauthInvalidState',
  provider_mismatch: 'errors.oauthInvalidState',
  email_in_use: 'errors.oauthEmailInUse',
  email_not_verified: 'errors.oauthEmailNotVerified',
  account_not_found: 'errors.oauthAccountNotFound',
  failed: 'errors.signInFailed',
};

export function oauthErrorMessage(slug: string): string {
  const key = SLUG_KEYS[slug] ?? SLUG_KEYS.failed!;
  return i18n.t(`auth:${key}`);
}
