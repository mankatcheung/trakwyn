/**
 * Validates a `returnTo` parameter — the location captured before an auth
 * redirect, honoured after login (JEF-233). Only same-origin absolute paths
 * count: a missing value falls back to the dashboard, and anything that
 * isn't a rooted path (`https://…`, `//evil.com`) is discarded rather than
 * turned into a redirect target.
 *
 * The two auth entry pages are never valid destinations — sending an
 * authenticated user to either would re-trigger the logged-in guard and
 * loop, or dead-end on the registration notice screen.
 */
export function safeReturnTo(value: string | undefined | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/dashboard';
  if (value === '/login' || value === '/register') return '/dashboard';
  return value;
}

/** ASCII control characters, which a browser strips from a URL before resolving it. */
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

/**
 * A same-origin path to send the user back to, or `null` when `value` is not
 * one (JEF-460). Stricter than `safeReturnTo`, and with no fallback: the
 * caller shows no way back rather than a default. A backslash or a control
 * character is refused because browsers read `/\evil.com` (or `/<tab>/evil.com`)
 * as `//evil.com`.
 */
export function sameOriginPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return null;
  if (value.includes('\\') || CONTROL_CHARACTER.test(value)) return null;
  return value;
}
