/**
 * Turns the `calendarError` slug `calendarOAuth.routes.ts` redirects with
 * into copy — same shape as `oauthError.ts` for login/link OAuth, and for
 * the same reason: the API sends a value from a closed set, never a message,
 * so nothing it reports can carry internal detail into the page.
 */
const SLUG_KEYS: Record<string, string> = {
  provider_denied: 'integrations.calendarErrorDenied',
  missing_code: 'integrations.calendarErrorFailed',
  invalid_state: 'integrations.calendarErrorInvalidState',
  provider_mismatch: 'integrations.calendarErrorInvalidState',
  connect_failed: 'integrations.calendarErrorFailed',
};

export function calendarErrorKey(slug: string): string {
  return SLUG_KEYS[slug] ?? 'integrations.calendarErrorFailed';
}
