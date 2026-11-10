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
  /** Pins the instant the demo seed's dates are relative to (JEF-532); unset means now. */
  SEED_NOW: 'SEED_NOW',
  STORAGE_PROVIDER: 'STORAGE_PROVIDER',
  BLOB_READ_WRITE_TOKEN: 'BLOB_READ_WRITE_TOKEN',
  BLOB_PUBLIC_READ_WRITE_TOKEN: 'BLOB_PUBLIC_READ_WRITE_TOKEN',
  /** The private store's token: documents and exported PDFs (JEF-51). */
  BLOB_PRIVATE_READ_WRITE_TOKEN: 'BLOB_PRIVATE_READ_WRITE_TOKEN',
  CACHE_PROVIDER: 'CACHE_PROVIDER',
  UPSTASH_REDIS_REST_URL: 'UPSTASH_REDIS_REST_URL',
  UPSTASH_REDIS_REST_TOKEN: 'UPSTASH_REDIS_REST_TOKEN',
  EMAIL_PROVIDER: 'EMAIL_PROVIDER',
  /** `tavily`, `fake` or `none` (JEF-538). Unset, or `tavily` without a key, is `none`. */
  SEARCH_PROVIDER: 'SEARCH_PROVIDER',
  TAVILY_API_KEY: 'TAVILY_API_KEY',
  BREVO_API_KEY: 'BREVO_API_KEY',
  FROM_EMAIL: 'FROM_EMAIL',
  FROM_NAME: 'FROM_NAME',
  LLM_API_KEY_ENCRYPTION_KEY: 'LLM_API_KEY_ENCRYPTION_KEY',
  DIGEST_ADMIN_SECRET: 'DIGEST_ADMIN_SECRET',
  CRON_SECRET: 'CRON_SECRET',
  /**
   * Email of the service account Cloud Scheduler mints OIDC ID tokens for
   * (JEF-336). A token for any other principal is refused by the admin routes.
   */
  CRON_INVOKER_SA: 'CRON_INVOKER_SA',
  AXIOM_TOKEN: 'AXIOM_TOKEN',
  AXIOM_DATASET: 'AXIOM_DATASET',
  AXIOM_METRICS_DATASET: 'AXIOM_METRICS_DATASET',
  AXIOM_LOGS_DATASET: 'AXIOM_LOGS_DATASET',
  /** Commit SHA the image was built from, baked in by CI (JEF-362). */
  APP_RELEASE: 'APP_RELEASE',
  /** `'true'` turns on the JEF-353 diagnostic — see `inboundTraceparent.ts`. */
  LOG_INBOUND_TRACEPARENT: 'LOG_INBOUND_TRACEPARENT',
  TOTP_ENCRYPTION_KEY: 'TOTP_ENCRYPTION_KEY',
  GOOGLE_OAUTH_CLIENT_ID: 'GOOGLE_OAUTH_CLIENT_ID',
  GOOGLE_OAUTH_CLIENT_SECRET: 'GOOGLE_OAUTH_CLIENT_SECRET',
  GITHUB_OAUTH_CLIENT_ID: 'GITHUB_OAUTH_CLIENT_ID',
  GITHUB_OAUTH_CLIENT_SECRET: 'GITHUB_OAUTH_CLIENT_SECRET',
  /**
   * Comma-separated Chrome extension IDs allowed to finish an OAuth login
   * (JEF-383). Only these IDs' `chromiumapp.org` URLs are ever redirected to.
   */
  EXTENSION_OAUTH_IDS: 'EXTENSION_OAUTH_IDS',
  OAUTH_PROVIDER_MODE: 'OAUTH_PROVIDER_MODE',
  GOOGLE_CALENDAR_CLIENT_ID: 'GOOGLE_CALENDAR_CLIENT_ID',
  GOOGLE_CALENDAR_CLIENT_SECRET: 'GOOGLE_CALENDAR_CLIENT_SECRET',
  CALENDAR_PROVIDER_MODE: 'CALENDAR_PROVIDER_MODE',
  LLM_PROVIDER_MODE: 'LLM_PROVIDER_MODE',
  OUTBOUND_URL_POLICY: 'OUTBOUND_URL_POLICY',
  /** `'true'` turns on the platform-owned LLM path (Hosted AI, JEF-446). Unset, nothing changes. */
  HOSTED_AI_ENABLED: 'HOSTED_AI_ENABLED',
  /**
   * Share of users (0-100, default 100) who get hosted AI, by a stable hash of
   * their id (JEF-453). Users outside it keep the own-key behaviour.
   */
  HOSTED_AI_ROLLOUT_PERCENT: 'HOSTED_AI_ROLLOUT_PERCENT',
  /** Comma-separated user ids who get hosted AI whatever the percentage (JEF-453). */
  HOSTED_AI_ALLOWLIST: 'HOSTED_AI_ALLOWLIST',
  /** Overrides `HOSTED_AI.DAILY_BUDGET_MICROS` with a USD amount (JEF-449). */
  HOSTED_AI_DAILY_BUDGET_USD: 'HOSTED_AI_DAILY_BUDGET_USD',
  /** The Cloudflare account whose Workers AI models answer hosted calls (JEF-453). Not secret. */
  PLATFORM_CLOUDFLARE_ACCOUNT_ID: 'PLATFORM_CLOUDFLARE_ACCOUNT_ID',
  /** Cloudflare API token (AI Gateway Run + Workers AI), sent as the bearer token. Secret. */
  PLATFORM_CLOUDFLARE_API_TOKEN: 'PLATFORM_CLOUDFLARE_API_TOKEN',
  /** The AI Gateway every hosted call is routed through. Defaults to `PLATFORM_LLM.DEFAULT_GATEWAY_ID`. */
  PLATFORM_CLOUDFLARE_GATEWAY_ID: 'PLATFORM_CLOUDFLARE_GATEWAY_ID',
  /**
   * `'true'` makes the Free and Pro plans bite (JEF-344): Pro features are refused
   * to Free users and the Free AI allowance applies. Unset or anything else, every
   * user gets every feature, which is also what a self-hosted instance runs.
   */
  PLANS_ENFORCED: 'PLANS_ENFORCED',
  /**
   * `true` | `false`. Whether a password sign-up is marked email-verified on the spot, with no
   * mail sent (JEF-438). Unset means `true` outside production, so dev, CI and e2e (which have
   * no inbox) never meet the verification wall, and `false` in production. Set `true` in
   * production only for a self-hosted instance with no working email provider.
   */
  AUTO_VERIFY_EMAIL: 'AUTO_VERIFY_EMAIL',
  /**
   * Kill switch for the email-verification wall (JEF-438). `false` turns it off for everyone:
   * the API stops refusing unverified accounts and reports them all as verified, so no client
   * shows the reminder. Unset, or anything else, keeps it on.
   */
  EMAIL_VERIFICATION_REQUIRED: 'EMAIL_VERIFICATION_REQUIRED',
  /** `turnstile` | `disabled`. Unset means `turnstile` in production, `disabled` elsewhere (JEF-401). */
  CAPTCHA_PROVIDER: 'CAPTCHA_PROVIDER',
  /** Cloudflare Turnstile's secret key — the server half of the widget's site key. */
  TURNSTILE_SECRET_KEY: 'TURNSTILE_SECRET_KEY',
  /** `fake` | `polar`. Unset means `fake` outside production; production must name one (JEF-426). */
  BILLING_PROVIDER: 'BILLING_PROVIDER',
  /** ISO date billing went live. Founder pricing counts 60 days from the later of this and signup. */
  BILLING_LIVE_FROM: 'BILLING_LIVE_FROM',
  /** Polar organization access token for the environment named by `POLAR_SERVER` (JEF-432). */
  POLAR_ACCESS_TOKEN: 'POLAR_ACCESS_TOKEN',
  /** The `whsec_…` secret of the Polar webhook endpoint, one per environment. */
  POLAR_WEBHOOK_SECRET: 'POLAR_WEBHOOK_SECRET',
  /** `sandbox` | `production`. No default: a live key must never be reached by omission. */
  POLAR_SERVER: 'POLAR_SERVER',
  /** Polar product ids, one per Trakwyn product (see `infra/polar/README.md`). */
  POLAR_PRODUCT_MONTHLY: 'POLAR_PRODUCT_MONTHLY',
  POLAR_PRODUCT_FOUNDER_MONTHLY: 'POLAR_PRODUCT_FOUNDER_MONTHLY',
  POLAR_PRODUCT_PASS_3M: 'POLAR_PRODUCT_PASS_3M',
  POLAR_PRODUCT_PASS_6M: 'POLAR_PRODUCT_PASS_6M',
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

/**
 * Postgres connection handling (JEF-342).
 *
 * `DATABASE_URL` selects the driver by scheme: `postgres://`/`postgresql://`
 * connect through a `pg` pool (production is Neon's pooled URL);
 * `pglite:<dir>` or `pglite:memory` run PGlite in-process, for local dev and
 * tests without a Postgres server.
 *
 * The pool is sized per Cloud Run instance, not globally — Neon's pooler
 * multiplexes every instance's connections onto the compute. Idle clients are
 * released quickly because Neon scales to zero after five idle minutes and
 * drops whatever sockets are still open when it does; a released client is
 * re-opened on the next request instead of failing it. The connect timeout
 * bounds a request that arrives while the compute is waking.
 */
export const DATABASE = {
  PGLITE_SCHEME: 'pglite:',
  PGLITE_IN_MEMORY: 'memory',
  /** Pre-JEF-342 local SQLite URLs — rejected with instructions, not treated as a Postgres host. */
  LEGACY_SQLITE_SCHEME: 'file:',
  /**
   * Connections per instance (JEF-372 reviewed it). Cloud Run allows 80
   * concurrent requests per instance, so a burst can queue behind this; the
   * `trakwyn.db.pool.connections` and `trakwyn.db.pool.waiting_requests`
   * gauges show whether it does. Raise it only once they show `used` pinned
   * at 10 with requests waiting.
   *
   * The ceiling is Neon's, and it is generous: the pooled URL goes through
   * PgBouncer in transaction mode, which accepts up to 10,000 client
   * connections and holds a server connection only for the length of a
   * transaction. The server side is capped at 90% of the compute's
   * `max_connections`, which scales with compute size (around 100 at the
   * smallest). `max_instances` × `POOL_MAX` is 3 × 10 = 30 today, so
   * doubling either still fits the smallest compute.
   */
  POOL_MAX: 10,
  POOL_IDLE_TIMEOUT_MS: 10_000,
  /** How long a request waits for a connection, queued or opening one, before pg-pool fails it. */
  POOL_CONNECTION_TIMEOUT_MS: 10_000,
  /** OID of `int8` — what `count(*)` and `sum()` over `integer` return; parsed to a JS number. */
  INT8_OID: 20,
} as const;

/** Captcha provider selection and the Turnstile siteverify endpoint (JEF-401). */
export const CAPTCHA = {
  PROVIDER: { TURNSTILE: 'turnstile', DISABLED: 'disabled' },
  TURNSTILE_VERIFY_URL: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
  VERIFY_TIMEOUT_MS: 5_000,
  /** Turnstile tokens are at most 2048 characters; anything longer is not one. */
  MAX_TOKEN_LENGTH: 2048,
} as const;

/** Payment provider selection (JEF-426). */
export const BILLING_ADAPTER = {
  PROVIDER: { FAKE: 'fake', POLAR: 'polar' },
  /** The fake provider signs its webhooks with this; it guards nothing real. */
  FAKE_WEBHOOK_SECRET: 'fake-billing-webhook-secret',
  FAKE_SIGNATURE_HEADER: 'x-fake-signature',
  /** The largest webhook body accepted. Provider events are a few KB. */
  WEBHOOK_BODY_LIMIT_BYTES: 256 * 1024,
} as const;

/** Polar's API and webhook vocabulary (JEF-432). Only `PolarBillingProvider` and its mapper read it. */
export const POLAR = {
  SERVER: { SANDBOX: 'sandbox', PRODUCTION: 'production' },
  API_URL: {
    sandbox: 'https://sandbox-api.polar.sh/v1',
    production: 'https://api.polar.sh/v1',
  },
  /** Pinned so a Polar change of "current" cannot change a payload under us. */
  API_VERSION: '2026-10',
  REQUEST_TIMEOUT_MS: 10_000,
  /** How much of a validation error is kept in the thrown message. */
  MAX_REPORTED_PROBLEMS: 5,
  MAX_PROBLEM_LENGTH: 160,
  /** Stands in for a buyer's email or user id that Polar quoted back in a message. */
  REDACTED: '[redacted]',
  /** What `DELETE /subscriptions/{id}` answers (JEF-439). 403 and 404 mean there is nothing left to revoke. */
  REVOKE_STATUS: { ALREADY_REVOKED: 403, NOT_FOUND: 404, PENDING_UPDATE: 409 },
  /**
   * `PATCH /subscriptions/{id}` with `cancel_at_period_end` (JEF-463). 403 is "already canceled,
   * set to end, or not active" and 404 "not found": nothing left to stop or resume either way.
   * A 409 is either `SubscriptionLocked` (pending an update, retry) or, on a resume,
   * `SubscriptionNotScheduledToCancel`, which also leaves nothing to do.
   */
  UPDATE_STATUS: { NOT_CHANGEABLE: 403, NOT_FOUND: 404, CONFLICT: 409 },
  NOT_SCHEDULED_TO_CANCEL_ERROR: 'SubscriptionNotScheduledToCancel',
  WEBHOOK_HEADER: {
    ID: 'webhook-id',
    TIMESTAMP: 'webhook-timestamp',
    SIGNATURE: 'webhook-signature',
  },
  /** The Trakwyn user id travels in checkout metadata under this key, and back on the order or subscription. */
  METADATA_USER_ID: 'userId',
  EVENT: {
    SUBSCRIPTION_ACTIVE: 'subscription.active',
    SUBSCRIPTION_UNCANCELED: 'subscription.uncanceled',
    SUBSCRIPTION_CANCELED: 'subscription.canceled',
    SUBSCRIPTION_REVOKED: 'subscription.revoked',
    ORDER_PAID: 'order.paid',
    ORDER_REFUNDED: 'order.refunded',
  },
  /** An order for a one-off product (a pass) is `purchase`; a subscription's first and later orders are not. */
  ORDER_BILLING_REASON_PURCHASE: 'purchase',
  ORDER_STATUS_REFUNDED: 'refunded',
} as const;

/** HTTP Authorization header. */
export const AUTH_HEADER = {
  BEARER_PREFIX: 'Bearer ',
} as const;

/**
 * Google-signed OIDC ID tokens, as Cloud Scheduler sends them to the admin
 * cron routes (JEF-336). Google issues both spellings of the issuer.
 */
export const GOOGLE_OIDC = {
  JWKS_URL: 'https://www.googleapis.com/oauth2/v3/certs',
  ISSUERS: ['https://accounts.google.com', 'accounts.google.com'],
  ALGORITHMS: ['RS256'],
  JWKS_UNAVAILABLE_EVENT: 'oidc.jwks_unavailable', // key fetch failed, not a bad token (JEF-356)
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
   * How long a step-up ticket stays valid (JEF-463). The client opens the
   * start route with it straight after minting it, so this only has to cover
   * the browser opening.
   */
  REAUTH_TICKET_TTL_MS: 2 * 60 * 1000, // 2 minutes
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

/**
Chrome's `chrome.identity.launchWebAuthFlow` redirect target (JEF-383).
 * Chrome intercepts navigations to this host and hands the URL back to the
 * extension with that ID, so a handoff code sent here reaches only it.
 */
export const EXTENSION_OAUTH = {
  /** A Chrome extension ID: 32 characters from `a` to `p`. */
  ID_PATTERN: /^[a-p]{32}$/,
  redirectUrl: (extensionId: string) => `https://${extensionId}.chromiumapp.org/`,
} as const;

/**
 * Google Calendar settings — a separate OAuth app (and broader scope) from
 * `OAUTH`'s Google sign-in above, since granting calendar write access is a
 * distinct consent from "sign in with Google". Google-only for now
 * (JEF-331); Outlook is JEF-543.
 */
export const CALENDAR_OAUTH = {
  GOOGLE_AUTHORIZATION_URL: 'https://accounts.google.com/o/oauth2/v2/auth',
  GOOGLE_TOKEN_URL: 'https://oauth2.googleapis.com/token',
  GOOGLE_SCOPE: 'https://www.googleapis.com/auth/calendar.events',
  GOOGLE_EVENTS_URL: 'https://www.googleapis.com/calendar/v3/calendars/primary/events',
  /** Google treats the signed-in user's default calendar as "primary" — no separate calendar id to discover. */
  PRIMARY_CALENDAR_ID: 'primary',
  STATE_TTL_MS: 5 * 60 * 1000, // 5 minutes
  callbackPath: (provider: string) => `/auth/calendar/${provider}/callback`,
} as const;

/** `CALENDAR_PROVIDER_MODE` values — mirrors `OAUTH_PROVIDER_MODE`. */
export const CALENDAR_PROVIDER_MODE = {
  REAL: 'real',
  /** Same-origin stand-in, no live Google calls — dev/CI until a real OAuth app is registered (JEF-331). */
  FAKE: 'fake',
} as const;

/**
 * The same-origin stand-in calendar-connect provider (`CALENDAR_PROVIDER_MODE=fake`).
 * See `FAKE_OAUTH` above for why this lives here rather than in the route table.
 */
export const FAKE_CALENDAR = {
  CONSENT_PATH: '/auth/calendar/fake-provider/authorize',
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
  LOGS_PATH: '/v1/logs',
  /**
   * Header carrying an Events-type dataset name. Traces and logs each send
   * their own dataset in it (JEF-373): Axiom wants one dataset per OTel
   * signal, and links them back up through a correlation group.
   */
  DATASET_HEADER: 'X-Axiom-Dataset',
  /** Metrics use a distinct header as well — Axiom requires a Metrics-type dataset. */
  METRICS_DATASET_HEADER: 'X-Axiom-Metrics-Dataset',
  SERVICE_NAME: 'trakwyn-api',
  DEFAULT_RELEASE: 'dev',
} as const;

/**
 * Names for the log lines the security mechanisms emit (JEF-350).
 *
 * Kept as stable dotted identifiers on an `event` field rather than left to
 * the wording of the message, so an Axiom monitor can key on the event
 * without matching prose that a later edit would quietly break. A fixed set,
 * unlike the per-job `job.<name>.completed` names `runScheduledJob` builds
 * from the job it was handed (JEF-352), which is why these are declared and
 * those are not.
 */
export const SECURITY_EVENTS = {
  RATE_LIMITED: 'security.rate_limited',
  OUTBOUND_URL_REFUSED: 'security.outbound_url.refused',
  /** A read-scoped MCP token called a write tool and was refused (JEF-365). */
  MCP_TOOL_REFUSED: 'mcp.tool.refused',
} as const;

/**
 * OTel conventions for the app's own spans (JEF-347) and cold starts (JEF-357, see coldStart.ts).
 */
export const TRACING = {
  /** `DomainError.code` on a failed use-case span — absent when the failure was not a DomainError. */
  ERROR_CODE_ATTRIBUTE: 'app.error.code',
  PROCESS_UPTIME_ATTRIBUTE: 'app.process_uptime_ms',
  STARTUP_PROBE_PATH: '/health',
  /** Called by CI against a revision with no traffic (JEF-476); like the startup probe, nobody waits on it. */
  READINESS_PATH: '/ready',
  /**
   * One span per MCP or chat tool call (JEF-365), named `<surface>.tool <name>`.
   * The shape of the call only: never its arguments or its result.
   */
  TOOL_SPAN_SUFFIX: '.tool',
  TOOL_NAME_ATTRIBUTE: 'app.tool.name',
  TOOL_ACCESS_ATTRIBUTE: 'app.tool.access',
  TOOL_SURFACE_ATTRIBUTE: 'app.tool.surface',
  TOOL_OUTCOME_ATTRIBUTE: 'app.tool.outcome',
  TOOL_RESULT_BYTES_ATTRIBUTE: 'app.tool.result_bytes',
  MCP_TOKEN_SCOPE_ATTRIBUTE: 'app.mcp.token_scope',
  /** The calling credential's id, on write calls only (JEF-466): the one to revoke. */
  MCP_TOKEN_ID_ATTRIBUTE: 'app.mcp.token_id',
  /** Stands in for a tool name that is not in the catalogue, so a client cannot mint span names or metric labels. */
  UNKNOWN_TOOL: 'unknown',
} as const;

/** Email provider (Brevo) defaults. */
export const EMAIL = {
  BREVO_API_URL: 'https://api.brevo.com/v3/smtp/email',
  DEFAULT_FROM_EMAIL: 'noreply@trakwyn.com',
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

/** `SEARCH_PROVIDER` values (JEF-538). */
export const SEARCH_PROVIDER = {
  TAVILY: 'tavily',
  /** Fixed results, no network: local dev, CI and e2e. */
  FAKE: 'fake',
  /** No search; a briefing is written from the company's own site alone. */
  NONE: 'none',
} as const;

/** The Tavily search API (JEF-538). */
export const TAVILY = {
  SEARCH_URL: 'https://api.tavily.com/search',
  TIMEOUT_MS: 8_000,
  /** `basic` costs 1 credit a call; snippets are enough for a short briefing. */
  SEARCH_DEPTH: 'basic',
  /** A search response is small; anything bigger is not one. */
  MAX_RESPONSE_BYTES: 256 * 1024,
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
 * The platform-owned LLM path (Hosted AI, JEF-446).
 *
 * Since JEF-453 the platform runs only on Cloudflare Workers AI models, called
 * through AI Gateway's OpenAI-compatible REST route with one Cloudflare API
 * token; no Google or OpenAI key is involved (users' own keys are unaffected).
 * Each tier lists its primary model first and its failover second: a 429 or
 * 5xx on the first retries once on the other, through the same gateway.
 */
/**
 * The default `CircuitBreaker` shape (JEF-159, JEF-504): consecutive failures
 * before short-circuiting further calls, and how long to wait before letting one
 * trial call through to check whether the dependency has recovered. Redis uses
 * these as they are; hosted AI sets its own in `HOSTED_AI_CIRCUIT`.
 */
export const CIRCUIT_BREAKER = {
  FAILURE_THRESHOLD: 5,
  COOLDOWN_MS: 30_000,
} as const;

/**
 * One circuit per hosted model (JEF-504). Lower than the default: a hosted call
 * can wait the full request timeout before it fails, so three in a row is
 * already half a minute of users waiting. This tracks health; the daily spend
 * breaker (`HOSTED_AI_SPEND`, JEF-449) is a separate budget guard.
 */
export const HOSTED_AI_CIRCUIT = {
  FAILURE_THRESHOLD: 3,
  COOLDOWN_MS: 30_000,
} as const;

export const PLATFORM_LLM = {
  /** The provider id recorded on `LlmUsageEvent` and the metrics. */
  PROVIDER_ID: 'workersai',
  DEFAULT_GATEWAY_ID: 'trakwyn',
  MODELS: {
    lite: ['@cf/google/gemma-4-26b-a4b-it', '@cf/openai/gpt-oss-120b'],
    mid: ['@cf/openai/gpt-oss-120b', '@cf/google/gemma-4-26b-a4b-it'],
  },
  /** `https://api.cloudflare.com/client/v4/accounts/<account>/ai/v1/chat/completions` */
  REST_BASE: 'https://api.cloudflare.com/client/v4/accounts',
  REST_PATH: 'ai/v1/chat/completions',
  /** Picks which AI Gateway a REST call is routed through. */
  GATEWAY_HEADER: 'cf-aig-gateway-id',
  /**
   * Opaque request tags for gateway analytics (JEF-497): a JSON object of at
   * most five string/number/boolean entries. Never an email or a raw user id.
   */
  METADATA_HEADER: 'cf-aig-metadata',
  /** Where the fake provider's `/chat/completions` lives; `ROUTES.LLM_FAKE_COMPLETIONS` is this. */
  FAKE_COMPLETIONS_PATH: '/llm-test/fake/chat/completions',
} as const;

/**
 * Workers AI bills in neurons (JEF-497). The estimate in `LLM_PRICES` and the
 * `neurons` figure a response carries should agree; a gap beyond the tolerance
 * means a price changed or the table is wrong.
 */
export const WORKERS_AI_BILLING = {
  /** $0.011 per 1,000 neurons is 11 micro-USD each. */
  MICRO_USD_PER_NEURON: 11,
  /** Relative gap between the estimate and the neurons-based cost that counts as a mismatch. */
  MISMATCH_TOLERANCE: 0.25,
  /** Gaps smaller than this are rounding on a tiny call, not a price change. */
  MISMATCH_MIN_MICROS: 200,
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

/** Reading the company's own site for a briefing (JEF-475). Shared between users, keyed on the site's host. */
export const COMPANY_RESEARCH = {
  USER_AGENT: JOB_POSTING_FETCH.USER_AGENT,
  TIMEOUT_MS: 8_000,
  MAX_BYTES: 512 * 1024,
  /** Each hop is re-checked against the outbound URL policy. */
  MAX_REDIRECTS: 3,
  /** Per page, after tags are removed; the use case caps the total again. */
  MAX_CHARS_PER_PAGE: 3_000,
  /** A page with less text than this is a shell (a script-rendered homepage), not something to cite. */
  MIN_PAGE_CHARS: 200,
  /** Tried in order after the homepage; the first that answers with text is kept. */
  ABOUT_PATHS: ['/about', '/about-us', '/company', '/our-story'],
  /** Subdomains a company hosts its hiring on; the company's site is the domain beneath. */
  HIRING_SUBDOMAINS: ['careers', 'jobs', 'work', 'join', 'apply', 'hire', 'www'],
  /**
   * Hosts that carry many companies' postings, so the posting link says
   * nothing about the company's own site. Matched on the host or any parent.
   */
  JOB_BOARD_HOSTS: [
    'linkedin.com',
    'indeed.com',
    'glassdoor.com',
    'greenhouse.io',
    'lever.co',
    'ashbyhq.com',
    'workable.com',
    'smartrecruiters.com',
    'myworkdayjobs.com',
    'bamboohr.com',
    'recruitee.com',
    'jobvite.com',
    'icims.com',
    'ziprecruiter.com',
    'monster.com',
    'reed.co.uk',
    'totaljobs.com',
    'wellfound.com',
    'angel.co',
    'ycombinator.com',
    'dice.com',
    'welcometothejungle.com',
  ],
  KEY_PREFIX: 'company-research',
  /** Bump when what is read or how it is cleaned changes, so old entries are not served. */
  VERSION: 'v1',
  /** A company's about page changes rarely; a week keeps a briefing roughly current. */
  TTL_MS: 7 * 24 * 60 * 60 * 1000,
} as const;

/**
 * Searching the web for what others say about a company (JEF-538): news,
 * funding, layoffs and reviews. Shared between users, keyed on the company.
 */
export const COMPANY_SEARCH = {
  /** Results kept per query, before de-duplication. */
  MAX_RESULTS: 5,
  /** How far back a news result may be dated. */
  NEWS_DAYS: 365,
  /** Per snippet, after trimming; the use case caps the total again. */
  MAX_SNIPPET_CHARS: 500,
  MAX_TITLE_CHARS: 120,
  /** A company name longer than this is not one; it is cut before it reaches a query or a key. */
  MAX_COMPANY_CHARS: 80,
  KEY_PREFIX: 'company-search',
  /** Bump when the queries or how results are cleaned change, so old entries are not served. */
  VERSION: 'v1',
  /** News ages faster than an about page, so this is shorter than `COMPANY_RESEARCH.TTL_MS`. */
  TTL_MS: 3 * 24 * 60 * 60 * 1000,
} as const;

/** Parsed postings shared between users, keyed on the fetched page's text (JEF-450). */
export const PARSED_POSTING_CACHE = {
  KEY_PREFIX: 'parsed-posting',
  /** Bump when the parse prompt or output shape changes, so old entries are not served. */
  VERSION: 'v1',
  /** Postings rarely change and expire within weeks. */
  TTL_MS: 7 * 24 * 60 * 60 * 1000,
} as const;

/** Reading a job posting's `schema.org/JobPosting` JSON-LD instead of asking a model (JEF-450). */
export const JOB_POSTING_JSON_LD = {
  /** Same bound the Clipper applies to a description it reads from JSON-LD. */
  MAX_DESCRIPTION_CHARS: 2000,
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

/**
 * The route that serves a stored document's file (JEF-51). Here rather than in
 * `http/constants.ts` because `DocumentFileLinkService` builds the URL and
 * infrastructure cannot import `http/`; `ROUTES.DOCUMENT_FILE` derives from it.
 */
export const DOCUMENT_FILE_ROUTE = {
  PATH: '/documents/:id/file',
  TOKEN_PARAM: 'token',
} as const;

/**
 * gpt-oss on Workers AI sometimes returns its reasoning and tool call as plain
 * `message.content` with the model's raw channel markers and no `tool_calls`
 * (JEF-541). `MARKER` finds those markers; `TEXT_PREFIX` is how the leaked
 * reasoning opens, so a stream holds back text that starts that way.
 */
export const LEAKED_TOOL_CALL = {
  MARKER: /<\|(?:start|end|call|channel|message|return|constrain)\|>/,
  TEXT_PREFIX: 'analysis',
} as const;

/**
 * Which models take a reasoning switch, and what "off" and "low" mean for
 * each (JEF-445). A pattern list, because providers do not say reliably.
 * A model matching nothing here never gets the parameter: an unknown field
 * can come back as a 400.
 */
export const REASONING_CONTROL = {
  /**
   * OpenAI `reasoning_effort`, sent only to OpenAI's own endpoint. `gpt-5*`
   * accepts `minimal` as its lowest setting; the `o` series has no `minimal`,
   * so `low` is the floor there.
   */
  OPENAI_MODELS: [
    { pattern: /^gpt-5/i, off: 'minimal', low: 'low' },
    { pattern: /^o\d/i, off: 'low', low: 'low' },
  ],
  /**
   * Gemini `thinkingConfig.thinkingBudget` (tokens). 2.5 Flash and Flash-Lite
   * can disable thinking (0); 2.5 Pro cannot, so it gets its minimum (128).
   * Listed most specific first.
   */
  GOOGLE_MODELS: [
    { pattern: /^gemini-2\.5-pro/i, off: 128, low: 1024 },
    { pattern: /^gemini-2\.5-flash/i, off: 0, low: 1024 },
  ],
  /**
   * Workers AI request fields (JEF-453), found by probing the models, not from
   * Cloudflare's docs. Gemma 4 drops its thinking entirely with
   * `chat_template_kwargs.enable_thinking = false` (4 completion tokens against
   * 239); it ignores `reasoning_effort`. gpt-oss has no off switch: `low` is
   * its floor and cut a probe from 58 to 21 completion tokens.
   */
  WORKERS_AI_MODELS: [
    {
      pattern: /gemma-4/i,
      off: { chat_template_kwargs: { enable_thinking: false } },
      low: { chat_template_kwargs: { enable_thinking: false } },
    },
    {
      pattern: /gpt-oss/i,
      off: { reasoning_effort: 'low' },
      low: { reasoning_effort: 'low' },
    },
  ],
} as const;

/** What one million tokens of a model cost, in micro-USD (1 USD = 1 000 000), per kind of token (JEF-444). */
export interface LlmPrice {
  input: number;
  /** Input served from the provider's prompt cache. Absent: billed as `input`. */
  cachedInput?: number;
  /** Input written to the prompt cache (Anthropic). Absent: billed as `input`. */
  cacheWrite?: number;
  output: number;
}

/**
 * List prices by provider id, then model id. In code rather than the DB:
 * they change a few times a year and a deploy is fine (JEF-444). A model that
 * is missing costs `null` and logs `llm.price_unknown` once; it is never
 * guessed. Prices are USD per million tokens × 1e6, from each vendor's
 * pricing page; re-check them when adding a model.
 */
export const LLM_PRICES: Readonly<Record<string, Readonly<Record<string, LlmPrice>>>> = {
  openai: {
    'gpt-4o-mini': { input: 150_000, cachedInput: 75_000, output: 600_000 },
  },
  anthropic: {
    'claude-haiku-4-5': {
      input: 1_000_000,
      cachedInput: 100_000,
      cacheWrite: 1_250_000,
      output: 5_000_000,
    },
    'claude-sonnet-4-5': {
      input: 3_000_000,
      cachedInput: 300_000,
      cacheWrite: 3_750_000,
      output: 15_000_000,
    },
    'claude-opus-4-5': {
      input: 5_000_000,
      cachedInput: 500_000,
      cacheWrite: 6_250_000,
      output: 25_000_000,
    },
  },
  googleai: {
    'gemini-2.5-flash-lite': { input: 100_000, cachedInput: 10_000, output: 400_000 },
    'gemini-2.5-flash': { input: 300_000, cachedInput: 30_000, output: 2_500_000 },
  },
  // Workers AI list prices from each model's page (JEF-453), no cached-input rate.
  workersai: {
    '@cf/google/gemma-4-26b-a4b-it': { input: 100_000, output: 300_000 },
    '@cf/openai/gpt-oss-120b': { input: 350_000, output: 750_000 },
  },
  openrouter: {
    'openai/gpt-4o-mini': { input: 150_000, cachedInput: 75_000, output: 600_000 },
  },
  groq: {
    'llama-3.3-70b-versatile': { input: 590_000, output: 790_000 },
  },
  deepseek: {
    'deepseek-chat': { input: 280_000, cachedInput: 28_000, output: 420_000 },
  },
};

/**
 * The daily hosted-AI spend counter (JEF-449). One key per UTC date; the TTL
 * outlives the day so a late increment still lands on a key that exists.
 */
export const HOSTED_AI_SPEND = {
  KEY_PREFIX: 'hosted-ai:spend:',
  TTL_MS: 48 * 60 * 60 * 1000,
  /** The `fields.event` of the warn line logged whenever the breaker refuses a call. */
  BREAKER_OPEN_EVENT: 'hosted_ai.breaker_open',
} as const;
