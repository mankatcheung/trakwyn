//! HTTP transport constants: cookie names and options, route paths.

use crate::use_cases::constants::token_lifetime_s;

/// Auth cookie names.
pub mod cookies {
    pub const ACCESS_TOKEN: &str = "trakwyn_access_token";
    pub const REFRESH_TOKEN: &str = "trakwyn_refresh_token";
    /// Non-HttpOnly hint cookie the web app reads to know a session exists.
    pub const LOGGED_IN: &str = "trakwyn_logged_in";
}

pub const COOKIE_PATH: &str = "/";

/// Cookie `Max-Age` values, in seconds: the lifetime of the token each cookie
/// carries, so the cookie expires exactly when its token does.
pub mod cookie_max_age_s {
    use super::token_lifetime_s;

    pub const ACCESS_TOKEN: i64 = token_lifetime_s::ACCESS_TOKEN;
    pub const REFRESH_TOKEN: i64 = token_lifetime_s::REFRESH_TOKEN;
}

/// HTTP route paths.
pub mod routes {
    pub const GRAPHQL: &str = "/graphql";
    pub const GRAPHIQL: &str = "/graphiql";
    /// Also Cloud Run's startup probe.
    pub const HEALTH: &str = "/health";
}

pub const BEARER_PREFIX: &str = "Bearer ";

/// Origins of the Trakwyn Clipper's pages, which CORS lets through: Chrome and Safari.
pub const EXTENSION_ORIGIN_SCHEMES: [&str; 2] = ["chrome-extension://", "safari-web-extension://"];

/// Vercel preview deployments of the web app.
pub const PREVIEW_ORIGIN_SUFFIX: &str = ".vercel.app";

/// Largest request body accepted, matching Fastify's default.
pub const BODY_LIMIT_BYTES: usize = 1024 * 1024;

/// Process shutdown budget. Cloud Run SIGKILLs an instance 10 seconds after
/// SIGTERM; draining in-flight requests gets 8 of them.
pub const SERVER_CLOSE_TIMEOUT_MS: u64 = 8_000;

/// Rate limits for endpoints prone to abuse (fixed-window, per key).
pub mod rate_limit {
    use crate::use_cases::ports::rate_limiter::RateLimit;

    const MINUTE_MS: u64 = 60 * 1000;
    const HOUR_MS: u64 = 60 * MINUTE_MS;

    pub const PASSWORD_RESET_REQUEST: RateLimit = RateLimit::new(5, 15 * MINUTE_MS);
    pub const TOTP_VERIFICATION: RateLimit = RateLimit::new(5, 15 * MINUTE_MS);
    pub const CHAT_MESSAGE: RateLimit = RateLimit::new(20, 5 * MINUTE_MS);
    pub const UPDATE_PASSWORD: RateLimit = RateLimit::new(5, 15 * MINUTE_MS);
    pub const REQUEST_EMAIL_CHANGE: RateLimit = RateLimit::new(3, HOUR_MS);
    pub const REQUEST_ADD_BACKUP_EMAIL: RateLimit = RateLimit::new(3, HOUR_MS);
    pub const REMOVE_BACKUP_EMAIL: RateLimit = RateLimit::new(3, HOUR_MS);
    pub const BACKUP_EMAIL_RECOVERY: RateLimit = RateLimit::new(5, 15 * MINUTE_MS);
    pub const MCP_OAUTH_REGISTRATION: RateLimit = RateLimit::new(10, 15 * MINUTE_MS);
    pub const MCP_OAUTH_AUTHORIZATION: RateLimit = RateLimit::new(20, 5 * MINUTE_MS);
    pub const MCP_OAUTH_TOKEN: RateLimit = RateLimit::new(20, 5 * MINUTE_MS);
    pub const MCP_OAUTH_REVOCATION: RateLimit = RateLimit::new(20, 5 * MINUTE_MS);
    // Single-shot AI mutations: more generous than chat, since each is a
    // discrete action. BYOK means this only burns the caller's own quota, so
    // the limit is about containing a looping client, not a shared resource.
    pub const GENERATE_COVER_LETTER: RateLimit = RateLimit::new(20, 5 * MINUTE_MS);
    /// Lower: a resume is a bigger completion, rarely regenerated on purpose.
    pub const GENERATE_RESUME: RateLimit = RateLimit::new(10, 5 * MINUTE_MS);
    pub const PARSE_JOB_DESCRIPTION: RateLimit = RateLimit::new(20, 5 * MINUTE_MS);
    pub const COMPUTE_RESUME_MATCH_SCORE: RateLimit = RateLimit::new(20, 5 * MINUTE_MS);
    pub const GENERATE_COMPANY_BRIEFING: RateLimit = RateLimit::new(20, 5 * MINUTE_MS);
    /// Tighter: the one BYOK mutation that can be driven with an arbitrary,
    /// unsaved key, so it could be used to hammer third-party keys through us.
    pub const TEST_LLM_API_KEY: RateLimit = RateLimit::new(10, 5 * MINUTE_MS);
}

/// The fake LLM completions endpoint: a same-origin stand-in for an
/// OpenAI-compatible `/chat/completions`, mounted only when
/// `LLM_PROVIDER_MODE=fake`. Not a new provider type: a user (or an e2e
/// test) points the existing "Custom" provider at it.
pub mod llm_fake_completions {
    pub const PATH: &str = "/llm-test/fake/chat/completions";
}
