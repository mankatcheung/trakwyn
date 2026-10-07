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
