import { resolveDefaultApiUrl } from './apiUrls';

/**
 * Centralised configuration and magic-value constants for the extension.
 *
 * Out of scope by design (kept next to their usage): GraphQL query text and
 * one-off user-facing copy.
 */

/**
 * Fallback GraphQL endpoint when the user hasn't configured one: the local API
 * under `wxt` dev, the production API in every build, or `VITE_API_URL`.
 */
export const DEFAULT_API_URL = resolveDefaultApiUrl({
  dev: import.meta.env.DEV,
  override: import.meta.env.VITE_API_URL,
});

/** `browser.storage` keys. */
export const STORAGE_KEYS = {
  /** Session-scoped auth state. */
  AUTH: 'auth',
  /**
   * Local-scoped copy of the refresh token, present only when the user chose
   * "Keep me signed in" (JEF-421). It outlives the browser; its presence is
   * the choice. The access token is never stored here.
   */
  PERSISTED_REFRESH_TOKEN: 'persistedRefreshToken',
  /** Session-scoped Safari tab sign-in in progress (see lib/tabOAuth.ts). */
  PENDING_TAB_OAUTH: 'pendingTabOAuth',
} as const;

/**
 * Page text sent to `parseJobDescription` is cut to this. The API reads the
 * first `AI_PROMPT_INPUT.JOB_POSTING_MAX_CHARS` (8000) and drops the rest, so
 * sending more only spends the user's bandwidth.
 */
export const PAGE_TEXT_MAX_CHARS = 8000;

/** OAuth login through the API's handoff-code flow (JEF-383). */
export const OAUTH = {
  /** The API's `OAUTH_PLATFORM.EXTENSION`: Chrome's `launchWebAuthFlow`. */
  PLATFORM: 'extension',
  /**
   * The API's `OAUTH_PLATFORM.EXTENSION_TAB` (JEF-386): Safari has no
   * `identity` API, so the login runs in a tab that ends on `TAB_DONE_PATH`.
   */
  TAB_PLATFORM: 'extension-tab',
  /** The API's `ROUTES.EXTENSION_OAUTH_DONE`, on the API's own origin. */
  TAB_DONE_PATH: '/auth/oauth/extension/done',
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
 * because the popup closes as soon as the sign-in window or tab takes focus;
 * refresh runs there so one context owns the rotating refresh token.
 */
export const RUNTIME_MESSAGES = {
  OAUTH_LOGIN: 'OAUTH_LOGIN',
  REFRESH_TOKEN: 'REFRESH_TOKEN',
} as const;

/** Messages the popup sends the job-page content script. */
export const CONTENT_MESSAGES = {
  GET_JOB_DATA: 'GET_JOB_DATA',
  /** The visible text of the posting, for the AI parser (JEF-420). */
  GET_PAGE_TEXT: 'GET_PAGE_TEXT',
} as const;

/** HTTP Authorization header. */
export const AUTH_HEADER = {
  BEARER_PREFIX: 'Bearer ',
} as const;

/** GraphQL `extensions.code` values the extension reacts to. */
export const API_ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  /** The API's AI errors, shown with their own copy (JEF-420). */
  AI_NOT_CONFIGURED: 'AI_NOT_CONFIGURED',
  AI_LIMIT_REACHED: 'AI_LIMIT_REACHED',
  AI_PROVIDER_ERROR: 'AI_PROVIDER_ERROR',
  AI_RESPONSE_INVALID: 'AI_RESPONSE_INVALID',
  RATE_LIMITED: 'RATE_LIMITED',
} as const;

/** From this status up, a response is the API failing rather than answering. */
export const HTTP_SERVER_ERROR_MIN = 500;

/** Error reporting to PostHog (JEF-387). See lib/observability/report.ts. */
export const OBSERVABILITY = {
  /** PostHog's EU ingestion host, used when `VITE_POSTHOG_HOST` is unset. */
  DEFAULT_HOST: 'https://eu.i.posthog.com',
  CAPTURE_PATH: '/i/v0/e/',
  /** `$lib` on every event, so Error Tracking can tell the Clipper's from web's. */
  LIB: 'trakwyn-extension',
  EXCEPTION_EVENT: '$exception',
  /** A report that takes longer than this is dropped. */
  SEND_TIMEOUT_MS: 5000,
} as const;

/** The events the Clipper names itself. Faults only, no product analytics. */
export const OBSERVABILITY_EVENTS = {
  /** The API was unreachable or answered 5xx. Same name as web and mobile. */
  GRAPHQL_REQUEST_FAILED: 'graphql_request_failed',
  /** The session could not be renewed, so the user was signed out. */
  TOKEN_REFRESH_FAILED: 'token_refresh_failed',
  /** A Google/GitHub sign-in ended in an error (never a cancel). */
  OAUTH_LOGIN_FAILED: 'oauth_login_failed',
  /** A job board's page gave the parsers less than they need. */
  PARSER_RESULT: 'parser_result',
} as const;

export type ObservabilityEvent = (typeof OBSERVABILITY_EVENTS)[keyof typeof OBSERVABILITY_EVENTS];

/** The extension contexts that report. The content script does not. */
export const EXTENSION_CONTEXTS = {
  BACKGROUND: 'background',
  POPUP: 'popup',
} as const;

export type ExtensionContext = (typeof EXTENSION_CONTEXTS)[keyof typeof EXTENSION_CONTEXTS];

/**
 * The job boards the content script runs on, by a suffix of the hostname.
 * Parser reports name the board, never the hostname: a Workday or Greenhouse
 * hostname carries the employer's name.
 */
export const JOB_BOARDS = [
  { id: 'linkedin', hostSuffix: 'linkedin.com' },
  { id: 'indeed', hostSuffix: 'indeed.com' },
  { id: 'glassdoor', hostSuffix: 'glassdoor.com' },
  { id: 'greenhouse', hostSuffix: 'greenhouse.io' },
  { id: 'lever', hostSuffix: 'lever.co' },
  { id: 'workday', hostSuffix: 'workday.com' },
  { id: 'workday', hostSuffix: 'myworkdayjobs.com' },
] as const;

export const UNKNOWN_JOB_BOARD = 'other';

export type JobBoard = (typeof JOB_BOARDS)[number]['id'] | typeof UNKNOWN_JOB_BOARD;
