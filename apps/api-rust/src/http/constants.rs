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
