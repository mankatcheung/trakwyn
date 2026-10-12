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

/// The local-storage routes: the upload target `LocalStorageProvider` hands
/// out and the read-back of what it stored. Registered only when storage is
/// local disk.
pub mod uploads {
    /// `PUT`: the wildcard is the storage key, percent-encoded.
    pub const UPLOAD: &str = "/uploads/_upload/{*key}";
    pub const UPLOAD_EMPTY_KEY: &str = "/uploads/_upload/";
    /// `GET`: the wildcard is the storage key.
    pub const OBJECT: &str = "/uploads/{*key}";
    pub const OBJECT_EMPTY_KEY: &str = "/uploads/";
    /// Key prefix of the upload route, never a stored object's key.
    pub const UPLOAD_PATH_PREFIX: &str = "_upload/";
    /// The request bodies the upload route reads; anything else is a 415.
    pub const ACCEPTED_CONTENT_TYPES: [&str; 3] =
        ["application/octet-stream", "text/plain", "application/pdf"];
    /// The type an upload is stored with when the request names none.
    pub const FALLBACK_CONTENT_TYPE: &str = "application/octet-stream";
}

/// The fake LLM completions endpoint: a same-origin stand-in for an
/// OpenAI-compatible `/chat/completions`, mounted only when
/// `LLM_PROVIDER_MODE=fake`. Not a new provider type: a user (or an e2e
/// test) points the existing "Custom" provider at it.
pub mod llm_fake_completions {
    pub const PATH: &str = "/llm-test/fake/chat/completions";
}

/// MCP OAuth endpoint paths, registered by `http/routes/mcp_oauth.rs`.
pub mod mcp_oauth_routes {
    pub const PROTECTED_RESOURCE_METADATA: &str = "/.well-known/oauth-protected-resource";
    pub const AUTHORIZATION_SERVER_METADATA: &str = "/.well-known/oauth-authorization-server";
    pub const AUTHORIZE: &str = "/oauth/authorize";
    pub const AUTHORIZE_APPROVE: &str = "/oauth/authorize/approve";
    pub const REGISTER: &str = "/oauth/register";
    pub const TOKEN: &str = "/oauth/token";
    pub const REVOKE: &str = "/oauth/revoke";
    /// The scopes the MCP server offers (`MCP.SCOPES` in `apps/api`).
    pub const SCOPES: [&str; 2] = ["read", "full"];
}

/// The `/admin/*` routes Cloud Scheduler drives, plus the public VAPID key.
pub mod admin_routes {
    pub const DIGEST_SEND: &str = "/admin/digest/send";
    pub const TRASH_PURGE: &str = "/admin/trash/purge";
    pub const REMINDERS_SEND: &str = "/admin/reminders/send";
    pub const PUSH_NOTIFICATIONS_SEND: &str = "/admin/push-notifications/send";
    pub const VAPID_PUBLIC_KEY: &str = "/vapid-public-key";
}

/// Names of the Cloud Scheduler-driven `/admin/*` jobs, as they appear in the
/// summary log lines (`job.<name>.completed`) the Axiom monitors group on, so
/// they must survive a route being moved.
pub mod admin_jobs {
    pub const DIGEST: &str = "digest";
    pub const TRASH_PURGE: &str = "trash_purge";
    pub const REMINDERS: &str = "reminders";
    pub const PUSH_NOTIFICATIONS: &str = "push_notifications";
}

/// Log events for a request a configured `/admin/*` route refused. Rejection
/// happens before the job runs, so without this a scheduler whose token
/// stopped verifying would leave no line at all.
pub mod cron_auth_events {
    pub const REJECTED: &str = "cron.auth.rejected";
}

/// The OAuth sign-in routes (`/auth/oauth/*`), registered by
/// `http/routes/oauth.rs` and, in fake provider mode, `fake_oauth_consent.rs`.
pub mod oauth_sign_in {
    pub const START: &str = "/auth/oauth/{provider}/start";
    pub const CALLBACK: &str = "/auth/oauth/{provider}/callback";
    /// Where a tab-based extension login ends (Safari, JEF-386).
    pub const EXTENSION_DONE: &str = "/auth/oauth/extension/done";
    /// Stand-in provider consent screen, mounted only when `OAUTH_PROVIDER_MODE=fake`.
    pub const FAKE_CONSENT: &str = crate::infrastructure::auth::FAKE_OAUTH_CONSENT_PATH;
    /// Binds the redirect to the browser that started it (JEF-198).
    pub const STATE_COOKIE: &str = "trakwyn_oauth_state";
    /// Where the API sends a mobile OAuth login when it is done: the app's own
    /// custom URL scheme, the same in every environment.
    pub const MOBILE_CALLBACK: &str = "trakwyn://oauth-callback";

    /// Which client started a login (JEF-275).
    pub mod platform {
        pub const WEB: &str = "web";
        pub const MOBILE: &str = "mobile";
        /// The Trakwyn Clipper in Chrome (JEF-383).
        pub const EXTENSION: &str = "extension";
        /// The Clipper in Safari, which signs in in a tab (JEF-386).
        pub const EXTENSION_TAB: &str = "extension-tab";
    }

    /// What `GET /auth/oauth/extension/done` answers with. Static: nothing
    /// from the query is echoed back.
    pub mod extension_done_page {
        pub const HTML: &str = concat!(
            "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">",
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
            "<title>Trakwyn Clipper</title></head>",
            "<body style=\"font-family: system-ui, sans-serif; text-align: center; padding: 3rem 1rem\">",
            "<p>You can close this tab and return to the Trakwyn Clipper.</p></body></html>"
        );
        /// The URL carries a handoff code: keep it out of caches and referrers.
        pub const HEADERS: [(&str, &str); 4] = [
            ("content-type", "text/html; charset=utf-8"),
            ("cache-control", "no-store"),
            ("referrer-policy", "no-referrer"),
            ("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'"),
        ];
    }
}

/// The MCP endpoint path (`ROUTES.MCP` in `apps/api`).
pub mod mcp_route {
    pub const PATH: &str = "/mcp";
}

/// `/chat/stream` (`ROUTES.CHAT_STREAM` and `CHAT_STREAM` in `apps/api`).
///
/// Request bodies are capped well below the global limit: a chat turn is one
/// id and one message of at most `chat::MAX_MESSAGE_CHARS` (64 KB leaves room
/// for 4-byte characters and JSON escaping), and an over-long body should be
/// refused before it is parsed.
pub mod chat_stream {
    pub const PATH: &str = "/chat/stream";
    pub const BODY_LIMIT_BYTES: usize = 64 * 1024;
}
