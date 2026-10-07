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
    use crate::domain::interview_round::InterviewRoundOutcome;

    pub const INTERVIEW_OUTCOME: InterviewRoundOutcome = InterviewRoundOutcome::Pending;
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
