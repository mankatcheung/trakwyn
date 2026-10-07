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
