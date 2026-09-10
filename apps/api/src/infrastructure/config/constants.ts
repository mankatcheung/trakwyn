/**
 * Infrastructure configuration: environment-variable names, provider
 * selectors, vendor endpoints, and cache internals.
 *
 * Everything an adapter needs to talk to the outside world. It may import
 * application policy from `use-cases/constants.ts` (as `SESSION_BLOCKLIST`
 * does) but never the reverse, and it names no HTTP route or cookie.
 *
 * Split out of the former root-level `src/constants.ts` (JEF-253).
 */

import { TOKEN_LIFETIME_S } from '#src/use-cases/constants.js';

/** Environment-variable key names. */
export const ENV = {
  NODE_ENV: 'NODE_ENV',
  PORT: 'PORT',
  CORS_ORIGIN: 'CORS_ORIGIN',
  /** The web app's public origin, used to build links in outbound email. */
  WEB_APP_ORIGIN: 'WEB_APP_ORIGIN',
  /** This API's own public origin, used as the OAuth issuer. */
  API_ORIGIN: 'API_ORIGIN',
  COOKIE_DOMAIN: 'COOKIE_DOMAIN',
  JWT_SECRET: 'JWT_SECRET',
  JWT_REFRESH_SECRET: 'JWT_REFRESH_SECRET',
  DATABASE_URL: 'DATABASE_URL',
  DATABASE_AUTH_TOKEN: 'DATABASE_AUTH_TOKEN',
  STORAGE_PROVIDER: 'STORAGE_PROVIDER',
  BLOB_READ_WRITE_TOKEN: 'BLOB_READ_WRITE_TOKEN',
  BLOB_PUBLIC_READ_WRITE_TOKEN: 'BLOB_PUBLIC_READ_WRITE_TOKEN',
  CACHE_PROVIDER: 'CACHE_PROVIDER',
  UPSTASH_REDIS_REST_URL: 'UPSTASH_REDIS_REST_URL',
  UPSTASH_REDIS_REST_TOKEN: 'UPSTASH_REDIS_REST_TOKEN',
  EMAIL_PROVIDER: 'EMAIL_PROVIDER',
  BREVO_API_KEY: 'BREVO_API_KEY',
  FROM_EMAIL: 'FROM_EMAIL',
  FROM_NAME: 'FROM_NAME',
  LLM_API_KEY_ENCRYPTION_KEY: 'LLM_API_KEY_ENCRYPTION_KEY',
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
  OAUTH_PROVIDER_MODE: 'OAUTH_PROVIDER_MODE',
  LLM_PROVIDER_MODE: 'LLM_PROVIDER_MODE',
  OUTBOUND_URL_POLICY: 'OUTBOUND_URL_POLICY',
  VAPID_PUBLIC_KEY: 'VAPID_PUBLIC_KEY',
  VAPID_PRIVATE_KEY: 'VAPID_PRIVATE_KEY',
  VAPID_SUBJECT: 'VAPID_SUBJECT',
} as const;

/** `NODE_ENV` values. */
export const NODE_ENV = {
  PRODUCTION: 'production',
} as const;

/**
 * The value `.env.example` ships for every secret-derivation passphrase.
 * Fine for a laptop; a production process that still carries it has its
 * users' encrypted API keys protected by a string in a public repo, so
 * `LlmApiKeyCipher` refuses to start with it there.
 */
export const PLACEHOLDER_SECRET = 'change-me-in-production';

/** HTTP Authorization header. */
export const AUTH_HEADER = {
  BEARER_PREFIX: 'Bearer ',
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
  /**
   * How long a mobile login's handoff code stays valid, in milliseconds
   * (JEF-275). It carries the finished session's tokens from the OAuth
   * callback (a browser redirect) to the app (a GraphQL mutation) across the
   * custom-scheme handoff, so it only needs to survive that one immediate
   * round-trip — short on purpose, unlike STATE_TTL_MS which spans the whole
   * provider detour.
   */
  MOBILE_HANDOFF_TTL_MS: 60 * 1000, // 1 minute
  /** Builds the concrete callback path (Fastify's `:provider` filled in) used as the OAuth redirect_uri. */
  callbackPath: (provider: string) => `/auth/oauth/${provider}/callback`,
  startPath: (provider: string) => `/auth/oauth/${provider}/start`,
} as const;

/** TOTP (RFC 6238) two-factor authentication settings. */
export const TOTP_CONFIG = {
  ISSUER: 'Trakwyn',
  /** Accept codes from the adjacent time step to absorb minor clock drift. */
  EPOCH_TOLERANCE_S: 30,
} as const;

/**
 * Revoked-session blocklist (JEF-164). Access-token verification is
 * otherwise fully stateless — signature and expiry only — so a revoked
 * session's already-issued access tokens would keep working until their own
 * natural expiry. Blocklisting the session id closes that window.
 */
export const SESSION_BLOCKLIST = {
  /**
   * How long a revoked session id stays blocklisted. Bounded to the access
   * token's own lifetime: past that, every access token the session ever
   * issued has expired on its own, so the entry has nothing left to block.
   * Keyed by `sid` rather than per-token, so one entry covers all of them.
   */
  TTL_MS: TOKEN_LIFETIME_S.ACCESS_TOKEN * 1000,
  KEY_PREFIX: 'revoked-session:',
  /**
   * MemorySessionBlocklist (local dev/tests) hard cap on live entries —
   * same unbounded-growth guard as MemoryCache's (JEF-130). Entries also
   * self-expire after TTL_MS; this only bounds a pathological burst.
   */
  MEMORY_MAX_ENTRIES: 10_000,
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
  SERVICE_NAME: 'trakwyn-api',
} as const;

/**
 * OpenTelemetry metric names (JEF-129). Dot-separated per OTel naming
 * convention, and prefixed so they're distinguishable from the metrics the
 * auto-instrumentations emit.
 */
export const METRICS = {
  CACHE_HITS: 'trakwyn.cache.hits',
  CACHE_MISSES: 'trakwyn.cache.misses',
  /** Redis call degraded gracefully rather than failing the request — attributes: component, reason. */
  REDIS_FAIL_OPEN: 'trakwyn.redis.fail_open',
  /** Circuit breaker state change — attributes: component, from, to. */
  CIRCUIT_TRANSITIONS: 'trakwyn.redis.circuit_transitions',
} as const;

/** Email provider (Brevo) defaults. */
export const EMAIL = {
  BREVO_API_URL: 'https://api.brevo.com/v3/smtp/email',
  DEFAULT_FROM_EMAIL: 'noreply@trakwyn.app',
  DEFAULT_FROM_NAME: 'Trakwyn',
} as const;

/** `STORAGE_PROVIDER` values. */
export const STORAGE_PROVIDER = {
  LOCAL: 'local',
  VERCEL_BLOB: 'vercel-blob',
} as const;

/** `EMAIL_PROVIDER` values. */
export const EMAIL_PROVIDER = {
  BREVO: 'brevo',
  /** Logs instead of calling Brevo — local dev without a key, and CI. */
  CONSOLE: 'console',
} as const;

/** `OAUTH_PROVIDER_MODE` values. */
export const OAUTH_PROVIDER_MODE = {
  REAL: 'real',
  /** Same-origin stand-in provider, no live Google/GitHub calls — e2e/CI only. */
  FAKE: 'fake',
} as const;

/** `LLM_PROVIDER_MODE` values — gates whether LLM_FAKE_COMPLETIONS exists at all. */
export const LLM_PROVIDER_MODE = {
  REAL: 'real',
  FAKE: 'fake',
} as const;

/**
 * Where the server refuses to connect on a user's behalf — see
 * `OutboundUrlPolicy`. Ports are the ones an SSRF is typically aimed at
 * (databases, caches, mail); the address ranges live in the policy itself.
 */
export const OUTBOUND_URL = {
  BLOCKED_PORTS: [22, 25, 3306, 5432, 6379, 9200, 11211, 27017],
} as const;

/**
 * `OUTBOUND_URL_POLICY` values (F13). Unset means "strict when
 * NODE_ENV=production, permissive otherwise". `permissive` exists for a
 * self-hosted production instance that runs a model on its own network and
 * wants to add it as a custom provider — an explicit choice to accept SSRF
 * exposure, never the default.
 */
export const OUTBOUND_URL_POLICY = {
  STRICT: 'strict',
  PERMISSIVE: 'permissive',
} as const;

/**
 * Fetching a job posting the user linked to (`FetchJobPostingSourceResolver`).
 * The byte cap bounds memory for an arbitrary URL — the parser only reads
 * the first `AI_PROMPT_INPUT.JOB_POSTING_MAX_CHARS` of the stripped text
 * anyway, and 1 MB of HTML is far more than that.
 */
export const JOB_POSTING_FETCH = {
  USER_AGENT: 'Mozilla/5.0 (compatible; TrakwynBot/1.0)',
  TIMEOUT_MS: 10_000,
  MAX_BYTES: 1024 * 1024,
  /** Each hop is re-checked against the outbound URL policy. */
  MAX_REDIRECTS: 3,
  /** A `<main>`/`<article>` with less text than this is a template shell, not the posting — fall back to the whole page. */
  MIN_CONTENT_REGION_CHARS: 200,
} as const;

/**
 * How much of an upstream error body is kept when a provider call fails.
 * Enough to diagnose ("invalid x-api-key", "model not found"), not enough to
 * carry a page of HTML — and never repeated verbatim to a client (JEF-S1).
 */
export const PROVIDER_ERROR_BODY_MAX_CHARS = 300;

/** Cache configuration, shared by MemoryCache and RedisCache. */
export const CACHE = {
  DEFAULT_TTL_MS: 5 * 60 * 1000, // 5 minutes
  // MemoryCache (local dev/tests) hard cap on live entries: exceeding it
  // evicts the least-recently-used entry so a warm/long-lived instance never
  // grows unbounded (JEF-130). Production uses RedisCache, which bounds its
  // own memory via Redis eviction.
  MEMORY_MAX_ENTRIES: 10_000,
  // Per-repository reverse-index maps (Cached*Repository): cap so the
  // id→owner mappings used to bust list caches on delete()/update() don't
  // grow monotonically with distinct ids seen (JEF-130). Evicted ids just
  // miss the list-cache bust for that delete; the stale entry still expires
  // via the normal TTL.
  REVERSE_INDEX_MAX_ENTRIES: 10_000,
  // Stampede protection (RedisCache.getOrSet): how long a populate-lock is
  // held before self-expiring (covers a crash mid-fetch), and how long a
  // concurrent miss polls for the lock-holder's result before giving up and
  // fetching directly itself.
  STAMPEDE_LOCK_TTL_MS: 10_000,
  STAMPEDE_POLL_INTERVAL_MS: 50,
  STAMPEDE_MAX_POLL_ATTEMPTS: 20, // ~1s of waiting
  // Circuit breaker (RedisCache): consecutive failures before short-circuiting
  // further calls, and how long to wait before letting one trial call through
  // to check whether Redis has recovered.
  CIRCUIT_FAILURE_THRESHOLD: 5,
  CIRCUIT_COOLDOWN_MS: 30_000,
  // Bearer credentials are cached far more briefly than the 5-minute default.
  // A cached row carries its own revokedAt, so revocation is only dangerous in
  // the gap between the DB write and the cache delete — this is the ceiling on
  // that gap if the delete is ever missed, not the mechanism that closes it.
  TOKEN_TTL_MS: 60 * 1000,
  // How long between writes of a token's lastUsedAt. It feeds a "last used"
  // column in settings, where a minute of granularity is indistinguishable
  // from none — throttling the write costs nothing users would notice.
  TOKEN_LAST_USED_TTL_MS: 60 * 1000,
} as const;

/** `CACHE_PROVIDER` values. */
export const CACHE_PROVIDER = {
  MEMORY: 'memory',
  REDIS: 'redis',
} as const;

export const CACHE_KEYS = {
  appById: (id: string) => `apps:byId:${id}`,
  appListPrefix: (userId: string) => `apps:list:${userId}:`,
  appTrashList: (userId: string) => `apps:trash:${userId}`,
  appList: (userId: string, status: string) => `apps:list:${userId}:${status}`,
  noteById: (id: string) => `notes:byId:${id}`,
  noteList: (applicationId: string) => `notes:list:${applicationId}`,
  docById: (id: string) => `docs:byId:${id}`,
  docList: (applicationId: string) => `docs:list:${applicationId}`,
  roundById: (id: string) => `rounds:byId:${id}`,
  roundList: (applicationId: string) => `rounds:list:${applicationId}`,
  contactById: (id: string) => `contacts:byId:${id}`,
  contactList: (applicationId: string) => `contacts:list:${applicationId}`,
  apiTokenById: (id: string) => `tokens:byId:${id}`,
  apiTokenByHash: (tokenHash: string) => `tokens:byHash:${tokenHash}`,
  apiTokenList: (userId: string) => `tokens:list:${userId}`,
  apiTokenLastUsed: (id: string) => `tokens:lastUsedWritten:${id}`,
  mcpOAuthTokenByHash: (tokenHash: string) => `mcpTokens:byHash:${tokenHash}`,
  mcpOAuthTokenLastUsed: (id: string) => `mcpTokens:lastUsedWritten:${id}`,
  notificationUnreadCount: (userId: string) => `notifications:unreadCount:${userId}`,
  userById: (id: string) => `users:byId:${id}`,
  userByEmail: (email: string) => `users:byEmail:${email}`,
  skillById: (id: string) => `skills:byId:${id}`,
  skillList: (userId: string) => `skills:list:${userId}`,
  educationById: (id: string) => `education:byId:${id}`,
  educationList: (userId: string) => `education:list:${userId}`,
  workExperienceById: (id: string) => `workExperience:byId:${id}`,
  workExperienceList: (userId: string) => `workExperience:list:${userId}`,
} as const;

/**
 * The same-origin stand-in OAuth provider (`OAUTH_PROVIDER_MODE=fake`).
 *
 * The consent path is declared here, with the provider that redirects to it,
 * rather than in the HTTP route table: `FakeOAuthProvider` is infrastructure
 * and must not import `http/`. `ROUTES.OAUTH_FAKE_CONSENT` re-exports this
 * value, so the route the server registers and the URL the provider builds
 * cannot drift apart.
 */
export const FAKE_OAUTH = {
  CONSENT_PATH: '/auth/oauth/fake-provider/authorize',
} as const;
