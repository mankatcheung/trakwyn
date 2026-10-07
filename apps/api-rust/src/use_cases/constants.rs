//! Application-policy constants: the rules the use-case layer enforces.
//!
//! Nothing here names a transport, a cookie, a route or a vendor endpoint;
//! those belong to `http::constants` and `infrastructure`.

/// Access- and refresh-token lifetimes, in seconds. The source of truth for
/// how long a session lives; cookie lifetimes derive from it.
pub mod token_lifetime_s {
    pub const ACCESS_TOKEN: i64 = 15 * 60;
    pub const REFRESH_TOKEN: i64 = 7 * 24 * 60 * 60;
}

/// API-token (`trakwyn_...`) settings.
pub mod api_token {
    pub const PREFIX: &str = "trakwyn_";
}

/// Per-user and per-application content caps.
pub mod content_limits {
    pub const APPLICATIONS_PER_USER: i32 = 50;
}

/// Trash: how long a soft-deleted application is kept before the purge job
/// removes it for good.
pub mod trash {
    pub const RETENTION_MS: i64 = 30 * 24 * 60 * 60 * 1000;
}

/// Reminder-eligibility windows, in milliseconds (used by the
/// application-repository query).
pub mod reminder_window_ms {
    /// Send when `followUpAt` is within 24h.
    pub const DUE_WITHIN: i64 = 24 * 60 * 60 * 1000;
    /// Don't resend within 23h.
    pub const RESEND_AFTER: i64 = 23 * 60 * 60 * 1000;
}

/// What a create falls back to when the caller names no value.
pub mod defaults {
    use crate::domain::interview_round::InterviewRoundOutcome;

    pub const INTERVIEW_OUTCOME: InterviewRoundOutcome = InterviewRoundOutcome::Pending;
}
