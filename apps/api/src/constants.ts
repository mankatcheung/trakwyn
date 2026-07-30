/**
 * Centralised configuration and magic-value constants for the API.
 *
 * Every config key, cookie name, token prefix, provider default, cache-key
 * prefix, route path, and GraphQL error code lives here — nothing of that kind
 * should be a bare string literal elsewhere in the codebase.
 *
 * Out of scope by design (kept next to their usage): Tailwind classes,
 * GraphQL query text, HTML fragments, and one-off user-facing copy.
 */

/** GraphQL error `extensions.code` values. */
export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  VALIDATION: 'VALIDATION',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

/** Environment-variable key names. */
export const ENV = {
  NODE_ENV: 'NODE_ENV',
  PORT: 'PORT',
  CORS_ORIGIN: 'CORS_ORIGIN',
  JWT_SECRET: 'JWT_SECRET',
  JWT_REFRESH_SECRET: 'JWT_REFRESH_SECRET',
  DATABASE_URL: 'DATABASE_URL',
  DATABASE_AUTH_TOKEN: 'DATABASE_AUTH_TOKEN',
  STORAGE_PROVIDER: 'STORAGE_PROVIDER',
  BLOB_READ_WRITE_TOKEN: 'BLOB_READ_WRITE_TOKEN',
  BLOB_PUBLIC_READ_WRITE_TOKEN: 'BLOB_PUBLIC_READ_WRITE_TOKEN',
  BREVO_API_KEY: 'BREVO_API_KEY',
  FROM_EMAIL: 'FROM_EMAIL',
  FROM_NAME: 'FROM_NAME',
  LLM_PROVIDER: 'LLM_PROVIDER',
  OPENROUTER_API_KEY: 'OPENROUTER_API_KEY',
  OPENROUTER_MODEL: 'OPENROUTER_MODEL',
  GOOGLEAI_API_KEY: 'GOOGLEAI_API_KEY',
  GOOGLEAI_MODEL: 'GOOGLEAI_MODEL',
  DIGEST_ADMIN_SECRET: 'DIGEST_ADMIN_SECRET',
  CRON_SECRET: 'CRON_SECRET',
  AXIOM_TOKEN: 'AXIOM_TOKEN',
  AXIOM_DATASET: 'AXIOM_DATASET',
  AXIOM_METRICS_DATASET: 'AXIOM_METRICS_DATASET',
  TOTP_ENCRYPTION_KEY: 'TOTP_ENCRYPTION_KEY',
  GOOGLE_OAUTH_CLIENT_ID: 'GOOGLE_OAUTH_CLIENT_ID',
  GOOGLE_OAUTH_CLIENT_SECRET: 'GOOGLE_OAUTH_CLIENT_SECRET',
  GITHUB_OAUTH_CLIENT_ID: 'GITHUB_OAUTH_CLIENT_ID',
  GITHUB_OAUTH_CLIENT_SECRET: 'GITHUB_OAUTH_CLIENT_SECRET',
  OFFLINE_MODE: 'OFFLINE_MODE',
} as const;

/** `NODE_ENV` values. */
export const NODE_ENV = {
  PRODUCTION: 'production',
} as const;

/** Auth cookie names. */
export const COOKIES = {
  ACCESS_TOKEN: 'jf_access_token',
  REFRESH_TOKEN: 'jf_refresh_token',
  /** Non-HttpOnly hint cookie the web app reads to know a session exists. */
  LOGGED_IN: 'jf_logged_in',
} as const;

/** Shared cookie options. */
export const COOKIE_PATH = '/';
export const COOKIE_SAME_SITE = 'lax' as const;

/** Cookie `maxAge` values, in seconds. */
export const COOKIE_MAX_AGE_S = {
  ACCESS_TOKEN: 15 * 60, // 15 minutes
  REFRESH_TOKEN: 7 * 24 * 60 * 60, // 7 days
} as const;

/** JWT sign expiry strings (jsonwebtoken format). */
export const JWT_EXPIRY = {
  ACCESS: '15m',
  REFRESH: '7d',
} as const;

/** Session (device/refresh-token tracking) settings. */
export const SESSION = {
  /** How long a session stays active without a refresh, in milliseconds — mirrors the refresh JWT's lifetime and slides forward on each refresh. */
  TTL_MS: COOKIE_MAX_AGE_S.REFRESH_TOKEN * 1000,
} as const;

/** API-token (`jfat_...`) settings. */
export const API_TOKEN = {
  PREFIX: 'jfat_',
  /** Number of random bytes hex-encoded into the token body. */
  RANDOM_BYTES: 24,
} as const;

/** Password-reset token settings. */
export const PASSWORD_RESET_TOKEN = {
  /** Number of random bytes hex-encoded into the token body. */
  RANDOM_BYTES: 32,
  /** How long a reset link stays valid, in milliseconds. */
  TTL_MS: 60 * 60 * 1000, // 1 hour
} as const;

/** Minimum length enforced server-side for any newly-set password. */
export const PASSWORD_MIN_LENGTH = 8;

/** API-token scopes (mirrors the `ApiTokenScope` domain union). */
export const API_TOKEN_SCOPE = {
  FULL: 'full',
  READ: 'read',
} as const;

/** TOTP (RFC 6238) two-factor authentication settings. */
export const TOTP_CONFIG = {
  ISSUER: 'Job Finder',
  /** Accept codes from the adjacent time step to absorb minor clock drift. */
  EPOCH_TOLERANCE_S: 30,
} as const;

/** Backup/recovery codes issued alongside TOTP enrollment. */
export const TOTP_BACKUP_CODES = {
  /** How many single-use codes to generate at enrollment. */
  COUNT: 10,
  /** Number of random bytes hex-encoded into each code (16 hex chars). */
  RANDOM_BYTES: 8,
} as const;

/** Rate limits for auth endpoints prone to abuse (in-process, fixed-window). */
export const RATE_LIMIT = {
  PASSWORD_RESET_REQUEST: {
    MAX_ATTEMPTS: 5,
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  },
  TOTP_VERIFICATION: {
    MAX_ATTEMPTS: 5,
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  },
} as const;

/** Email-verification token settings. */
export const EMAIL_VERIFICATION_TOKEN = {
  /** Number of random bytes hex-encoded into the token body. */
  RANDOM_BYTES: 32,
  /** How long a verification link stays valid, in milliseconds. */
  TTL_MS: 24 * 60 * 60 * 1000, // 24 hours
} as const;

/** HTTP Authorization header. */
export const AUTH_HEADER = {
  BEARER_PREFIX: 'Bearer ',
} as const;

/** MCP (Model Context Protocol) server identity and JSON-RPC framing. */
export const MCP = {
  JSONRPC_VERSION: '2.0',
  PROTOCOL_VERSION: '2024-11-05',
  SERVER_NAME: 'job-finder-mcp',
  SERVER_VERSION: '1.0.0',
} as const;

/**
 * JSON-RPC 2.0 error codes.
 * @see https://www.jsonrpc.org/specification#error_object
 */
export const JSON_RPC_ERROR = {
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

/** HTTP route paths registered outside the GraphQL endpoint. */
export const ROUTES = {
  GRAPHQL: '/graphql',
  HEALTH: '/health',
  MCP: '/mcp',
  DIGEST_SEND: '/admin/digest/send',
  REMINDERS_SEND: '/admin/reminders/send',
  OAUTH_START: '/auth/oauth/:provider/start',
  OAUTH_CALLBACK: '/auth/oauth/:provider/callback',
} as const;

/** OAuth provider names (mirrors the `OAuthProviderName` domain union). */
export const OAUTH_PROVIDER = {
  GOOGLE: 'google',
  GITHUB: 'github',
} as const;

/** OAuth (Google/GitHub) sign-in settings. */
export const OAUTH = {
  GOOGLE_AUTHORIZATION_URL: 'https://accounts.google.com/o/oauth2/v2/auth',
  GOOGLE_TOKEN_URL: 'https://oauth2.googleapis.com/token',
  GOOGLE_USERINFO_URL: 'https://openidconnect.googleapis.com/v1/userinfo',
  GITHUB_AUTHORIZATION_URL: 'https://github.com/login/oauth/authorize',
  GITHUB_TOKEN_URL: 'https://github.com/login/oauth/access_token',
  GITHUB_USER_URL: 'https://api.github.com/user',
  GITHUB_EMAILS_URL: 'https://api.github.com/user/emails',
  /** How long the signed `state` redirect param stays valid, in milliseconds. */
  STATE_TTL_MS: 5 * 60 * 1000, // 5 minutes
  /** Builds the concrete callback path (Fastify's `:provider` filled in) used as the OAuth redirect_uri. */
  callbackPath: (provider: string) => `/auth/oauth/${provider}/callback`,
  startPath: (provider: string) => `/auth/oauth/${provider}/start`,
} as const;

/** `LLM_PROVIDER` values. */
export const LLM_PROVIDER = {
  OPENROUTER: 'openrouter',
  GOOGLEAI: 'googleai',
} as const;

/** LLM provider defaults. */
export const LLM = {
  OPENROUTER_API_URL: 'https://openrouter.ai/api/v1/chat/completions',
  OPENROUTER_DEFAULT_MODEL: 'openai/gpt-4o-mini',
  GOOGLEAI_API_URL: 'https://generativelanguage.googleapis.com/v1beta/models',
  GOOGLEAI_DEFAULT_MODEL: 'gemini-2.0-flash',
} as const;

/**
 * Axiom (observability: logs, traces, metrics) settings.
 * @see https://axiom.co/docs/send-data/opentelemetry
 */
export const AXIOM = {
  API_URL: 'https://eu-central-1.aws.edge.axiom.co',
  TRACES_PATH: '/v1/traces',
  METRICS_PATH: '/v1/metrics',
  /** Header carrying the dataset name for logs and traces. */
  DATASET_HEADER: 'X-Axiom-Dataset',
  /** Metrics use a distinct dataset (and header) from logs/traces — Axiom requires a Metrics-type dataset. */
  METRICS_DATASET_HEADER: 'X-Axiom-Metrics-Dataset',
  SERVICE_NAME: 'job-finder-api',
} as const;

/** Email provider (Brevo) defaults. */
export const EMAIL = {
  BREVO_API_URL: 'https://api.brevo.com/v3/smtp/email',
  DEFAULT_FROM_EMAIL: 'noreply@jobfinder.app',
  DEFAULT_FROM_NAME: 'Job Finder',
} as const;

/** `STORAGE_PROVIDER` values. */
export const STORAGE_PROVIDER = {
  LOCAL: 'local',
  VERCEL_BLOB: 'vercel-blob',
} as const;

/** In-memory cache configuration. */
export const CACHE = {
  DEFAULT_TTL_MS: 5 * 60 * 1000, // 5 minutes
} as const;

/**
 * Cache-key builders. Centralising the prefixes keeps the read paths and the
 * invalidation paths in lock-step.
 */
export const CACHE_KEYS = {
  appById: (id: string) => `apps:byId:${id}`,
  appListPrefix: (userId: string) => `apps:list:${userId}:`,
  appList: (userId: string, status: string) => `apps:list:${userId}:${status}`,
  noteById: (id: string) => `notes:byId:${id}`,
  noteList: (applicationId: string) => `notes:list:${applicationId}`,
  docById: (id: string) => `docs:byId:${id}`,
  docList: (applicationId: string) => `docs:list:${applicationId}`,
  roundById: (id: string) => `rounds:byId:${id}`,
  roundList: (applicationId: string) => `rounds:list:${applicationId}`,
} as const;

/** Background-job and business-rule durations, in milliseconds. */
export const DURATIONS_MS = {
  WEEK: 7 * 24 * 60 * 60 * 1000, // weekly-digest window — 7 days
} as const;

/** Reminder-eligibility windows, in milliseconds (used by the application-repository query). */
export const REMINDER_WINDOW_MS = {
  DUE_WITHIN: 24 * 60 * 60 * 1000, // send when followUpAt is within 24h
  RESEND_AFTER: 23 * 60 * 60 * 1000, // don't resend within 23h
} as const;

/** Weekly-digest resend-guard window, in milliseconds. */
export const DIGEST_WINDOW_MS = {
  /** Don't resend the digest if the last send was within this window (digest cadence is 7 days). */
  RESEND_AFTER: 6 * 24 * 60 * 60 * 1000, // 6 days
} as const;

/** Default field values applied when the caller omits them. */
export const DEFAULTS = {
  APPLICATION_STATUS: 'draft',
  DOCUMENT_TYPE: 'other',
  INTERVIEW_TYPE: 'other',
  INTERVIEW_OUTCOME: 'pending',
  API_TOKEN_SCOPE: API_TOKEN_SCOPE.FULL,
} as const;

/** Account security activity log settings. */
export const LOGIN_HISTORY = {
  /** Max number of recent login events surfaced to the user. */
  LIMIT: 20,
} as const;

/** Limits for bulk-write mutations (e.g. bulk update/delete applications). */
export const BULK_ACTIONS = {
  /** Max number of IDs accepted in a single bulk mutation call. */
  MAX_IDS: 200,
} as const;

/** Defaults/limits for cursor-paginated list queries. */
export const PAGINATION = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

/** MIME types accepted for document uploads (resumes, cover letters, portfolios). */
export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/png',
  'image/jpeg',
] as const;

/** Max accepted document upload size, in bytes. */
export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/** MIME types accepted for avatar/profile-photo uploads. */
export const ALLOWED_AVATAR_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** Max accepted avatar upload size, in bytes. */
export const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
