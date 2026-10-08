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
    /// Number of random bytes hex-encoded into the token body.
    pub const RANDOM_BYTES: usize = 24;
}

/// Per-application document quota and the default a document is stored
/// with. The counter (`JobApplication.documentCount`) is maintained
/// transactionally by the document repository.
pub mod document_limits {
    pub const DOCUMENTS_PER_APPLICATION: i32 = 10;
    /// `Document.documentType` when the caller omits it.
    pub const DEFAULT_DOCUMENT_TYPE: &str = "other";
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
    use crate::domain::api_token::ApiTokenScope;
    use crate::domain::application::ApplicationStatus;
    use crate::domain::interview_round::InterviewRoundOutcome;

    pub const APPLICATION_STATUS: ApplicationStatus = ApplicationStatus::Draft;
    pub const INTERVIEW_OUTCOME: InterviewRoundOutcome = InterviewRoundOutcome::Pending;
    pub const API_TOKEN_SCOPE: ApiTokenScope = ApiTokenScope::Full;
}

/// Read-only share-link (`jfsl_...`) settings.
pub mod share_link {
    pub const PREFIX: &str = "jfsl_";
    /// Number of random bytes hex-encoded into the token body.
    pub const RANDOM_BYTES: usize = 24;
}

/// Durations, in milliseconds.
pub mod durations_ms {
    /// The weekly-digest and "recently updated" window: 7 days.
    pub const WEEK: i64 = 7 * 24 * 60 * 60 * 1000;
}

/// `LLM_PROVIDER` values: the providers a user can bring a key for.
pub mod llm_provider {
    pub const OPENAI: &str = "openai";
    pub const ANTHROPIC: &str = "anthropic";
    pub const GOOGLEAI: &str = "googleai";
    pub const OPENROUTER: &str = "openrouter";
    pub const MISTRAL: &str = "mistral";
    pub const GROQ: &str = "groq";
    pub const XAI: &str = "xai";
    pub const DEEPSEEK: &str = "deepseek";
    pub const NVIDIA: &str = "nvidia";
    pub const CUSTOM: &str = "custom";

    pub const ALL: [&str; 10] =
        [OPENAI, ANTHROPIC, GOOGLEAI, OPENROUTER, MISTRAL, GROQ, XAI, DEEPSEEK, NVIDIA, CUSTOM];
}

/// Budgets, timeouts and retry policy every LLM call obeys. Vendor endpoints
/// and default models live with the adapters in `infrastructure::llm`.
pub mod llm {
    /// Output-token budget applied when a caller doesn't specify one.
    pub const DEFAULT_MAX_TOKENS: u32 = 512;
    /// Output-token budget for the "does this key work" ping: the call only
    /// has to succeed, not produce a usable reply.
    pub const TEST_API_KEY_MAX_TOKENS: u32 = 5;
    /// Hard ceiling on requested output tokens, enforced by every provider
    /// whatever a caller asks for, so a bug cannot run up cost through
    /// unbounded output length.
    pub const MAX_OUTPUT_TOKENS_CAP: u32 = 2048;
    /// Per-attempt request timeout for non-streaming provider calls.
    pub const REQUEST_TIMEOUT_MS: u64 = 45_000;
    /// Idle timeout for streaming provider calls: resets on every chunk, so
    /// it fires when bytes stop arriving, not on total stream duration.
    pub const STREAM_IDLE_TIMEOUT_MS: u64 = 45_000;
    /// Extra attempts after the first for transient (network / 5xx)
    /// failures. A 4xx never retries, except a 429 naming a short Retry-After.
    pub const MAX_RETRIES: u32 = 2;
    /// A 429 or 503 whose `Retry-After` is at most this long is waited out
    /// and retried within the same attempt budget; a longer one, or a 429
    /// with no header, is returned to the caller.
    pub const RETRY_AFTER_MAX_MS: u64 = 5_000;
    /// Base delay before a retry; doubles each attempt (300ms, 600ms, ...).
    pub const RETRY_BACKOFF_BASE_MS: u64 = 300;
}

/// Character-truncation limits for job-description-derived content
/// interpolated into LLM prompts, named in one place so token-budget
/// decisions are visible. These are also exactly the fields wrapped as
/// untrusted content: they come from an external job posting, not from the
/// requesting user's own account data.
pub mod ai_prompt_input {
    /// Parsing a job description: the raw scraped or pasted posting text.
    pub const JOB_POSTING_MAX_CHARS: usize = 8000;
    /// Cover letter generation: the application's job description field.
    pub const COVER_LETTER_JOB_DESCRIPTION_MAX_CHARS: usize = 3000;
    /// Company briefing generation: the application's job description field.
    pub const COMPANY_BRIEFING_JOB_DESCRIPTION_MAX_CHARS: usize = 3000;
    /// Resume match scoring: the application's job description field.
    pub const RESUME_MATCH_JOB_DESCRIPTION_MAX_CHARS: usize = 6000;
    /// Cover letter and resume generation: the user's notes on the application.
    pub const APPLICATION_NOTES_MAX_CHARS: usize = 2000;
    /// Cover letter generation: the stored company briefing.
    pub const APPLICATION_BRIEFING_MAX_CHARS: usize = 2000;
    /// Cover letter generation: opt-in cross-application context, notes and drafts combined.
    pub const CROSS_APPLICATION_CONTEXT_MAX_CHARS: usize = 2000;
    /// Cover letter generation: how many other applications' notes and drafts to pull from.
    pub const CROSS_APPLICATION_CONTEXT_MAX_APPLICATIONS: usize = 3;
}

/// Named MIME types, for referencing a specific type instead of repeating
/// the string literal.
pub mod mime_type {
    pub const PDF: &str = "application/pdf";
    pub const DOC: &str = "application/msword";
    pub const DOCX: &str =
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    pub const TEXT_PLAIN: &str = "text/plain";
    pub const PNG: &str = "image/png";
    pub const JPEG: &str = "image/jpeg";
}

/// Bounds on reading an uploaded resume back for analysis. The size limit is
/// the document upload cap restated at read time: storage is trusted, but a
/// stale or oversized object should not be parsed on the request path. The
/// timeouts keep a pathological PDF from holding a request open indefinitely.
pub mod resume_text_extraction {
    /// The document upload cap (10 MB).
    pub const MAX_BYTES: usize = 10 * 1024 * 1024;
    pub const FETCH_TIMEOUT_MS: u64 = 15_000;
    pub const EXTRACT_TIMEOUT_MS: u64 = 20_000;
}

/// What an interview round is created as when the caller names no type.
pub mod interview_round_defaults {
    use crate::domain::interview_round::InterviewRoundType;

    pub const TYPE: InterviewRoundType = InterviewRoundType::Other;
}

/// How many pay periods make a year, for comparing offers on different
/// periods.
pub mod offer_normalization {
    pub const MONTHS_PER_YEAR: i64 = 12;
    pub const WEEKS_PER_YEAR: i64 = 52;
    /// 40 hours a week.
    pub const WORKING_HOURS_PER_YEAR: i64 = 40 * WEEKS_PER_YEAR;
}

/// Bulk mutations over a selection of applications.
pub mod bulk_actions {
    /// Max number of ids accepted in a single bulk mutation call.
    pub const MAX_IDS: usize = 200;
}

/// The kanban board.
pub mod board {
    /// Max cards accepted in one kanban column reorder. Deliberately not
    /// `bulk_actions::MAX_IDS`: that caps how much a user may act on at once,
    /// whereas this caps a column the user did not choose the size of.
    pub const MAX_REORDER_IDS: usize = 500;
}

/// Cursor pagination: the page size when the caller names none, and the cap.
pub mod pagination {
    pub const DEFAULT_LIMIT: i64 = 20;
    pub const MAX_LIMIT: i64 = 100;
}

/// What a document upload may be: the accepted MIME types (resumes, cover
/// letters, portfolios) and the largest accepted size.
pub mod document_upload {
    use super::{mime_type, resume_text_extraction};

    pub const ALLOWED_MIME_TYPES: [&str; 6] = [
        mime_type::PDF,
        mime_type::DOC,
        mime_type::DOCX,
        mime_type::TEXT_PLAIN,
        mime_type::PNG,
        mime_type::JPEG,
    ];
    /// 10 MB. `resume_text_extraction::MAX_BYTES` is this cap restated at
    /// read time, so the two are one value.
    pub const MAX_SIZE_BYTES: i32 = resume_text_extraction::MAX_BYTES as i32;
    /// A sanitized upload filename is cut to this many characters.
    pub const MAX_FILENAME_CHARS: usize = 200;
}

/// `Document.documentType` values.
pub mod document_type {
    pub const RESUME: &str = "resume";
    pub const COVER_LETTER: &str = "cover_letter";
    pub const PORTFOLIO: &str = "portfolio";
    pub const OTHER: &str = "other";
}

/// Server-side session tracking (JEF-164).
pub mod session {
    use super::token_lifetime_s;

    /// How long a session stays active without a refresh, in milliseconds:
    /// mirrors the refresh JWT's lifetime and slides forward on each refresh.
    pub const TTL_MS: i64 = token_lifetime_s::REFRESH_TOKEN * 1000;
    /// Window after a rotation in which the just-superseded refresh token is
    /// still accepted, to absorb benign concurrent-tab refresh races without
    /// flagging them as reuse.
    pub const ROTATION_GRACE_MS: i64 = 10 * 1000;
}

/// Password policy.
pub mod password {
    /// Minimum length, in UTF-16 code units (what `apps/api` counts).
    pub const MIN_LENGTH: usize = 8;
    /// bcrypt work factor. Hashes written by either implementation carry
    /// their own cost, so both verify each other's.
    pub const BCRYPT_COST: u32 = 12;
}

/// Step-up re-authentication: how long after a full authentication a session
/// still counts as fresh enough for a sensitive action on a 2FA account.
pub mod reauth {
    pub const FRESHNESS_WINDOW_MS: i64 = 15 * 60 * 1000;
}

/// Password-reset token settings.
pub mod password_reset_token {
    /// Number of random bytes hex-encoded into the token body.
    pub const RANDOM_BYTES: usize = 32;
    /// How long a reset link stays valid, in milliseconds.
    pub const TTL_MS: i64 = 60 * 60 * 1000;
}

/// Backup/recovery codes issued alongside TOTP enrollment.
pub mod totp_backup_codes {
    /// How many single-use codes to generate at enrollment.
    pub const COUNT: usize = 10;
    /// Number of random bytes hex-encoded into each code (16 hex chars).
    pub const RANDOM_BYTES: usize = 8;
}

/// Email-verification token settings.
pub mod email_verification_token {
    /// Number of random bytes hex-encoded into the token body.
    pub const RANDOM_BYTES: usize = 32;
    /// How long a verification link stays valid, in milliseconds.
    pub const TTL_MS: i64 = 24 * 60 * 60 * 1000;
}

/// Login history shown to the user.
pub mod login_history {
    /// Max number of recent login events surfaced to the user.
    pub const LIMIT: i64 = 20;
}

/// Unified security activity feed (logins plus password, email, 2FA and
/// session events).
pub mod security_activity {
    /// Max number of items in the merged feed, and the per-source fetch
    /// limit: each source is fetched up to this many, then merged, sorted and
    /// truncated, so the most recent N overall are never missed even if one
    /// source dominates recent activity.
    pub const LIMIT: i64 = 20;
}

/// `event` names for refused sign-ins (JEF-354), which the monitors group on.
pub mod auth_failure_events {
    pub const LOGIN_FAILED: &str = "auth.login.failed";
    pub const TOTP_FAILED: &str = "auth.totp.failed";
}

/// Backup email verification token settings.
pub mod backup_email_verification_token {
    /// Number of random bytes hex-encoded into the token body.
    pub const RANDOM_BYTES: usize = 32;
    /// How long a verification link stays valid, in milliseconds.
    pub const TTL_MS: i64 = 24 * 60 * 60 * 1000;
}

/// Profile photo uploads.
pub mod avatar {
    pub const ALLOWED_MIME_TYPES: [&str; 3] = ["image/png", "image/jpeg", "image/webp"];
    /// Max accepted avatar upload size, in bytes (5 MB).
    pub const MAX_SIZE_BYTES: i32 = 5 * 1024 * 1024;
}

/// What an imported application falls back to when the file names no
/// recognised status. Kept apart from `defaults` so the block the
/// applications slice extends is not touched from two branches.
pub mod import_defaults {
    use crate::domain::application::ApplicationStatus;

    pub const APPLICATION_STATUS: ApplicationStatus = ApplicationStatus::Draft;
}

/// MCP OAuth (the authorization server `apps/api` runs for MCP clients).
/// `RESOURCE` is the token audience the validate use case checks, not a
/// route. The consent token's lifetime stays with the service that signs it
/// (`infrastructure::auth::MCP_CONSENT_TOKEN_TTL_MS`).
pub mod mcp_oauth {
    pub const RESOURCE: &str = "/mcp";
    pub const CLIENT_ID_PREFIX: &str = "trakwyn_mcp_client_";
    pub const CLIENT_ID_RANDOM_BYTES: usize = 16;
    pub const CLIENT_NAME_MAX_LENGTH: usize = 100;
    pub const AUTHORIZATION_CODE_PREFIX: &str = "trakwyn_mcp_code_";
    pub const AUTHORIZATION_CODE_RANDOM_BYTES: usize = 32;
    pub const AUTHORIZATION_CODE_TTL_MS: i64 = 5 * 60 * 1000;
    pub const REFRESH_TOKEN_PREFIX: &str = "trakwyn_mcp_refresh_";
    pub const REFRESH_TOKEN_RANDOM_BYTES: usize = 32;
    pub const REFRESH_TOKEN_TTL_MS: i64 = 30 * 24 * 60 * 60 * 1000;
    pub const ACCESS_TOKEN_PREFIX: &str = "trakwyn_mcp_";
    pub const ACCESS_TOKEN_RANDOM_BYTES: usize = 32;
    pub const ACCESS_TOKEN_TTL_MS: i64 = 60 * 60 * 1000;
    /// RFC 7636 s4.1: a code verifier is 43 to 128 characters.
    pub const CODE_VERIFIER_MIN_LENGTH: usize = 43;
    pub const CODE_VERIFIER_MAX_LENGTH: usize = 128;
}

/// Weekly-digest resend guards and the daily period, in milliseconds.
pub mod digest_window_ms {
    /// Don't resend a weekly digest if the last send was within 6 days.
    pub const RESEND_AFTER: i64 = 6 * 24 * 60 * 60 * 1000;
    /// Don't resend a daily digest if the last send was within 23 hours.
    pub const DAILY_RESEND_AFTER: i64 = 23 * 60 * 60 * 1000;
    /// The period a daily digest covers.
    pub const DAY: i64 = 24 * 60 * 60 * 1000;
}
