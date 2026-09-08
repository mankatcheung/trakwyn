/**
 * HTTP transport constants: cookie names and options, route paths, and the
 * rate limits the DI container registers.
 *
 * The outermost layer, so this file may import from anywhere — it derives
 * cookie lifetimes from `use-cases` policy and the fake-consent path from
 * `infrastructure` config rather than restating either.
 *
 * Split out of the former root-level `src/constants.ts` (JEF-253).
 */

import { FAKE_OAUTH } from '#src/infrastructure/config/constants.js';
import { TOKEN_LIFETIME_S } from '#src/use-cases/constants.js';

/** Auth cookie names. */
export const COOKIES = {
  ACCESS_TOKEN: 'trakwyn_access_token',
  REFRESH_TOKEN: 'trakwyn_refresh_token',
  /** Non-HttpOnly hint cookie the web app reads to know a session exists. */
  LOGGED_IN: 'trakwyn_logged_in',
  /**
   * Ties an in-flight OAuth redirect to the browser that started it. Holds the
   * nonce from the signed `state`; the callback refuses a state whose nonce
   * does not match (JEF-198).
   */
  OAUTH_STATE: 'trakwyn_oauth_state',
} as const;

/** Shared cookie options. */
export const COOKIE_PATH = '/';

export const COOKIE_SAME_SITE = 'lax' as const;

/** HTTP route paths registered outside the GraphQL endpoint. */
export const ROUTES = {
  GRAPHQL: '/graphql',
  HEALTH: '/health',
  MCP: '/mcp',
  /**
   * Streams the assistant's chat reply (JEF-239) — not GraphQL, since
   * streaming needs incremental writes to the raw response that Mercurius/
   * Pothos's request-response model, and this codebase's `IHttpResponse`
   * port's send()-once shape, don't support. Same cookie-based JWT auth as
   * GraphQL, registered directly on the Fastify instance in `buildApp.ts`
   * (like the local-upload route) rather than through the `RouteDefinition`
   * abstraction, for the same reason.
   */
  CHAT_STREAM: '/chat/stream',
  DIGEST_SEND: '/admin/digest/send',
  TRASH_PURGE: '/admin/trash/purge',
  REMINDERS_SEND: '/admin/reminders/send',
  PUSH_NOTIFICATIONS_SEND: '/admin/push-notifications/send',
  VAPID_PUBLIC_KEY: '/vapid-public-key',
  OAUTH_START: '/auth/oauth/:provider/start',
  OAUTH_CALLBACK: '/auth/oauth/:provider/callback',
  /** Stand-in "provider" consent screen, registered only when OAUTH_PROVIDER_MODE=fake — see FakeOAuthProvider. */
  OAUTH_FAKE_CONSENT: FAKE_OAUTH.CONSENT_PATH,
  /**
   * Stand-in OpenAI-compatible /chat/completions endpoint, registered only
   * when LLM_PROVIDER_MODE=fake. Not a new provider type — a user (or an e2e
   * test) points the existing "Custom (OpenAI-compatible)" provider's own
   * base URL at this path, the same real, already-supported mechanism
   * self-hosted/OpenAI-compatible endpoints already use.
   */
  LLM_FAKE_COMPLETIONS: '/llm-test/fake/chat/completions',
} as const;

/**
 * `/chat/stream` request bodies. Fastify's default is 1 MB, sized for file
 * uploads; a chat turn is one id and one message of at most
 * `CHAT.MAX_MESSAGE_CHARS` (64 KB leaves room for 4-byte characters and JSON
 * escaping), and an over-long body should be refused before it is parsed.
 */
export const CHAT_STREAM = {
  BODY_LIMIT_BYTES: 64 * 1024,
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
  CHAT_MESSAGE: {
    MAX_ATTEMPTS: 20,
    WINDOW_MS: 5 * 60 * 1000, // 5 minutes
  },
  UPDATE_PASSWORD: {
    MAX_ATTEMPTS: 5,
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  },
  REQUEST_EMAIL_CHANGE: {
    MAX_ATTEMPTS: 3,
    WINDOW_MS: 60 * 60 * 1000, // 1 hour
  },
  REQUEST_ADD_BACKUP_EMAIL: {
    MAX_ATTEMPTS: 3,
    WINDOW_MS: 60 * 60 * 1000, // 1 hour
  },
  REMOVE_BACKUP_EMAIL: {
    MAX_ATTEMPTS: 3,
    WINDOW_MS: 60 * 60 * 1000, // 1 hour
  },
  BACKUP_EMAIL_RECOVERY: {
    MAX_ATTEMPTS: 5,
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  },
  MCP_OAUTH_REGISTRATION: {
    MAX_ATTEMPTS: 10,
    WINDOW_MS: 15 * 60 * 1000,
  },
  MCP_OAUTH_AUTHORIZATION: {
    MAX_ATTEMPTS: 20,
    WINDOW_MS: 5 * 60 * 1000,
  },
  MCP_OAUTH_TOKEN: {
    MAX_ATTEMPTS: 20,
    WINDOW_MS: 5 * 60 * 1000,
  },
  MCP_OAUTH_REVOCATION: {
    MAX_ATTEMPTS: 20,
    WINDOW_MS: 5 * 60 * 1000,
  },
  // Single-shot AI mutations (cover letter / JD parsing / resume match) — more
  // generous than CHAT_MESSAGE since each is a discrete action rather than a
  // back-and-forth conversation. BYOK means this only ever burns the calling
  // user's own provider quota, so severity is about abuse/bug containment
  // (a buggy client looping the mutation), not shared-resource protection.
  GENERATE_COVER_LETTER: {
    MAX_ATTEMPTS: 20,
    WINDOW_MS: 5 * 60 * 1000, // 5 minutes
  },
  // Lower than the others: a resume is a bigger completion (2048 tokens) and
  // regenerating it repeatedly is rarely what someone means to do.
  GENERATE_RESUME: {
    MAX_ATTEMPTS: 10,
    WINDOW_MS: 5 * 60 * 1000, // 5 minutes
  },
  PARSE_JOB_DESCRIPTION: {
    MAX_ATTEMPTS: 20,
    WINDOW_MS: 5 * 60 * 1000, // 5 minutes
  },
  COMPUTE_RESUME_MATCH_SCORE: {
    MAX_ATTEMPTS: 20,
    WINDOW_MS: 5 * 60 * 1000, // 5 minutes
  },
  GENERATE_COMPANY_BRIEFING: {
    MAX_ATTEMPTS: 20,
    WINDOW_MS: 5 * 60 * 1000, // 5 minutes
  },
  // Tighter than the other BYOK actions above (JEF-247): a "Test" click is a
  // single cheap ping, not a natural conversational/generation flow, and
  // this is the one BYOK mutation that can be driven with an arbitrary,
  // not-yet-saved key value — worth a lower ceiling against someone using it
  // to hammer third-party API keys through our backend.
  TEST_LLM_API_KEY: {
    MAX_ATTEMPTS: 10,
    WINDOW_MS: 5 * 60 * 1000, // 5 minutes
  },
} as const;

/** OAuth provider names (mirrors the `OAuthProviderName` domain union). */
export const OAUTH_PROVIDER = {
  GOOGLE: 'google',
  GITHUB: 'github',
} as const;

/**
 * Which client started an OAuth login (JEF-275) — carried in the redirect
 * cookie set at `/start`, not the signed `state`, so it survives every
 * failure branch of `/callback`, including ones that never get far enough to
 * verify `state` at all.
 */
export const OAUTH_PLATFORM = {
  WEB: 'web',
  MOBILE: 'mobile',
} as const;

/**
 * Where the API sends a mobile OAuth login when it's done — the app's own
 * custom URL scheme (`app.json`'s `scheme`), handled by expo-router's linking
 * config rather than a web route. Fixed regardless of environment: it names
 * the installed app, not a server.
 */
export const MOBILE_OAUTH_CALLBACK = 'trakwyn://oauth-callback';

/**
 * Cookie `maxAge` values, in seconds — the lifetime of the token each cookie
 * carries, so the cookie expires exactly when its token does.
 */
export const COOKIE_MAX_AGE_S = TOKEN_LIFETIME_S;

/** MCP OAuth endpoint paths, registered by `http/routes/mcpOAuth.routes.ts`. */
export const MCP_OAUTH_ROUTES = {
  PROTECTED_RESOURCE_METADATA: '/.well-known/oauth-protected-resource',
  AUTHORIZATION_SERVER_METADATA: '/.well-known/oauth-authorization-server',
  AUTHORIZE: '/oauth/authorize',
  AUTHORIZE_APPROVE: '/oauth/authorize/approve',
  REGISTER: '/oauth/register',
  TOKEN: '/oauth/token',
  REVOKE: '/oauth/revoke',
} as const;
