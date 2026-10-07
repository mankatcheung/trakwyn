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
    use crate::domain::application::ApplicationStatus;
    use crate::domain::interview_round::InterviewRoundOutcome;

    pub const APPLICATION_STATUS: ApplicationStatus = ApplicationStatus::Draft;
    pub const INTERVIEW_OUTCOME: InterviewRoundOutcome = InterviewRoundOutcome::Pending;
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
