/**
 * Centralised configuration and magic-value constants for the extension.
 *
 * Out of scope by design (kept next to their usage): GraphQL query text and
 * one-off user-facing copy.
 */

/** Fallback GraphQL endpoint when the user hasn't configured one. */
export const DEFAULT_API_URL = 'http://localhost:3001/graphql';

/** `chrome.storage` keys. */
export const STORAGE_KEYS = {
  /** Session-scoped auth state. */
  AUTH: 'auth',
  /** Sync-scoped configured API URL. */
  API_URL: 'apiUrl',
} as const;

/** OAuth login through the API's handoff-code flow (JEF-383). */
export const OAUTH = {
  /** The API's `OAUTH_PLATFORM.EXTENSION`. */
  PLATFORM: 'extension',
  startPath: (provider: OAuthProvider) => `/auth/oauth/${provider}/start`,
  /** The provider's Cancel button. Not a fault, so shown as no error. */
  CANCELLED_SLUG: 'access_denied',
  FAILED_SLUG: 'failed',
} as const;

export const OAUTH_PROVIDERS = [
  { id: 'google', label: 'Google' },
  { id: 'github', label: 'GitHub' },
] as const;

export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number]['id'];

/** Refresh the access token this long before it expires. */
export const REFRESH_LEEWAY_MS = 2 * 60 * 1000;

/**
 * Messages the popup sends the background service worker. OAuth runs there
 * because the popup closes as soon as Chrome's sign-in window takes focus;
 * refresh runs there so one context owns the rotating refresh token.
 */
export const RUNTIME_MESSAGES = {
  OAUTH_LOGIN: 'OAUTH_LOGIN',
  REFRESH_TOKEN: 'REFRESH_TOKEN',
} as const;

/** HTTP Authorization header. */
export const AUTH_HEADER = {
  BEARER_PREFIX: 'Bearer ',
} as const;
