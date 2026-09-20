/**
 * Centralised configuration and magic-value constants for the web app.
 *
 * Out of scope by design (kept next to their usage): Tailwind classes,
 * GraphQL query text, React Query keys, and one-off user-facing copy.
 *
 * Note: `import.meta.env.VITE_*` is intentionally accessed statically at its
 * call site — Vite replaces those references at build time, so they must not
 * be turned into dynamic property lookups.
 */

/** GraphQL error `extensions.code` values surfaced by the API. */
export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  VALIDATION: 'VALIDATION',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

/**
 * Longest chat message the API accepts (`CHAT.MAX_MESSAGE_CHARS` in
 * apps/api). Mirrored here so the composer stops at the limit instead of
 * letting the user type past it and learn from a 400.
 */
export const CHAT_MESSAGE_MAX_CHARS = 8000;

/** Fallback GraphQL endpoint when `VITE_API_URL` is unset (dev proxy path). */
export const DEFAULT_API_URL = '/graphql';

/**
 * Public contact address rendered on /privacy, /terms and /accessibility.
 * Declared once here rather than per page: all three link to the same
 * mailbox, and it was previously duplicated in each of them (JEF-338).
 */
export const CONTACT_EMAIL = 'contact@trakwyn.com';

/**
 * PostHog's EU ingestion host, used when `VITE_POSTHOG_HOST` is unset
 * (JEF-349). EU Cloud rather than US: the app already takes region-aware
 * consent seriously enough to gate analytics behind it (JEF-211), and
 * keeping the events in the EU is the other half of that.
 */
export const POSTHOG_EU_HOST = 'https://eu.i.posthog.com';

/**
 * How many exceptions are held in memory while the consent check is still
 * resolving. Small on purpose: this exists so the first error of a page
 * load isn't lost, not to replay a whole session once consent lands.
 */
export const POSTHOG_PENDING_EXCEPTION_LIMIT = 10;
