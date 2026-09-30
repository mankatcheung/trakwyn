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

/** Auth cookie names shared with the API. */
export const COOKIES = {
  ACCESS_TOKEN: 'trakwyn_access_token',
} as const;

/** HTTP Authorization header. */
export const AUTH_HEADER = {
  BEARER_PREFIX: 'Bearer ',
} as const;

/** GraphQL `extensions.code` values the extension reacts to. */
export const API_ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
} as const;
