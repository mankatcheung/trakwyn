//! How a use case says something went wrong.
//!
//! A `DomainError` carries a code and a message, never an HTTP status:
//! `http::errors` maps the code at the boundary. The codes are the GraphQL
//! `extensions.code` values clients already switch on.

use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ErrorCode {
    Unauthorized,
    UserNotFound,
    Forbidden,
    NotFound,
    Conflict,
    QuotaExceeded,
    Validation,
    RateLimited,
    InternalError,
    ServiceUnavailable,
    AiNotConfigured,
    AiResponseInvalid,
    AiLimitReached,
    AiProviderError,
    StepUpRequired,
}

impl ErrorCode {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Unauthorized => "UNAUTHORIZED",
            Self::UserNotFound => "USER_NOT_FOUND",
            Self::Forbidden => "FORBIDDEN",
            Self::NotFound => "NOT_FOUND",
            Self::Conflict => "CONFLICT",
            Self::QuotaExceeded => "QUOTA_EXCEEDED",
            Self::Validation => "VALIDATION",
            Self::RateLimited => "RATE_LIMITED",
            Self::InternalError => "INTERNAL_ERROR",
            Self::ServiceUnavailable => "SERVICE_UNAVAILABLE",
            Self::AiNotConfigured => "AI_NOT_CONFIGURED",
            Self::AiResponseInvalid => "AI_RESPONSE_INVALID",
            Self::AiLimitReached => "AI_LIMIT_REACHED",
            Self::AiProviderError => "AI_PROVIDER_ERROR",
            Self::StepUpRequired => "STEP_UP_REQUIRED",
        }
    }
}

impl fmt::Display for ErrorCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// An error a use case raises. `Internal` is the one variant a client never
/// sees the message of: it wraps an infrastructure failure (a query that
/// failed, a provider that threw) whose text may quote query parameters.
#[derive(Debug, thiserror::Error)]
pub enum DomainError {
    #[error("{message}")]
    Coded { code: ErrorCode, message: String },
    #[error("internal error: {0}")]
    Internal(#[source] Box<dyn std::error::Error + Send + Sync>),
}

pub type DomainResult<T> = Result<T, DomainError>;

impl DomainError {
    fn coded(code: ErrorCode, message: impl Into<String>) -> Self {
        Self::Coded { code, message: message.into() }
    }

    pub fn code(&self) -> ErrorCode {
        match self {
            Self::Coded { code, .. } => *code,
            Self::Internal(_) => ErrorCode::InternalError,
        }
    }

    pub fn internal(source: impl Into<Box<dyn std::error::Error + Send + Sync>>) -> Self {
        Self::Internal(source.into())
    }

    /// The thing asked for does not exist, or does not belong to this user.
    /// Accepts a noun ("Skill") or a whole sentence ending in "not found".
    pub fn not_found(resource: impl AsRef<str>) -> Self {
        let resource = resource.as_ref();
        let message = if resource.to_ascii_lowercase().ends_with("not found") {
            resource.to_string()
        } else {
            format!("{resource} not found")
        };
        Self::coded(ErrorCode::NotFound, message)
    }

    /// The thing exists; this user may not do that to it.
    pub fn forbidden(message: impl Into<String>) -> Self {
        Self::coded(ErrorCode::Forbidden, message)
    }

    /// The request conflicts with something already there.
    pub fn conflict(message: impl Into<String>) -> Self {
        Self::coded(ErrorCode::Conflict, message)
    }

    pub fn quota_exceeded(message: impl Into<String>) -> Self {
        Self::coded(ErrorCode::QuotaExceeded, message)
    }

    /// The caller is not authenticated, or their credential no longer stands.
    pub fn unauthorized(message: impl Into<String>) -> Self {
        Self::coded(ErrorCode::Unauthorized, message)
    }

    /// The input is malformed or fails a rule the caller can fix.
    pub fn validation(message: impl Into<String>) -> Self {
        Self::coded(ErrorCode::Validation, message)
    }

    pub fn rate_limited(message: impl Into<String>) -> Self {
        Self::coded(ErrorCode::RateLimited, message)
    }

    /// The action needs a fresh authentication before it will be allowed.
    pub fn step_up_required(message: impl Into<String>) -> Self {
        Self::coded(ErrorCode::StepUpRequired, message)
    }

    /// No email matches. Distinct from `not_found` so the sign-in page can say so.
    pub fn user_not_found(message: impl Into<String>) -> Self {
        Self::coded(ErrorCode::UserNotFound, message)
    }

    pub fn ai_not_configured(message: impl Into<String>) -> Self {
        Self::coded(ErrorCode::AiNotConfigured, message)
    }

    pub fn ai_limit_reached(message: impl Into<String>) -> Self {
        Self::coded(ErrorCode::AiLimitReached, message)
    }

    pub fn ai_provider_error(message: impl Into<String>) -> Self {
        Self::coded(ErrorCode::AiProviderError, message)
    }

    pub fn ai_response_invalid(message: impl Into<String>) -> Self {
        Self::coded(ErrorCode::AiResponseInvalid, message)
    }

    pub fn service_unavailable(message: impl Into<String>) -> Self {
        Self::coded(ErrorCode::ServiceUnavailable, message)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn not_found_appends_to_a_noun() {
        assert_eq!(DomainError::not_found("Skill").to_string(), "Skill not found");
    }

    #[test]
    fn not_found_keeps_a_whole_sentence() {
        let err = DomainError::not_found("Application Not Found");
        assert_eq!(err.to_string(), "Application Not Found");
        assert_eq!(err.code(), ErrorCode::NotFound);
    }

    #[test]
    fn internal_errors_report_the_internal_code() {
        let err = DomainError::internal(std::io::Error::other("connection refused"));
        assert_eq!(err.code(), ErrorCode::InternalError);
    }
}
