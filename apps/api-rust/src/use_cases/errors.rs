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
    Coded {
        code: ErrorCode,
        message: String,
        /// Set only by [`DomainError::llm_provider`]: how the user's own LLM
        /// provider failed. Never part of `message`.
        llm_provider: Option<LlmProviderFailure>,
    },
    #[error("internal error: {0}")]
    Internal(#[source] Box<dyn std::error::Error + Send + Sync>),
}

pub type DomainResult<T> = Result<T, DomainError>;

/// How the user's own provider failed, coarse enough to act on: `Auth` means
/// fix the key, `Quota`/`RateLimited` mean wait or pay, `BadRequest` means
/// the model or request shape, `Unavailable` means try later.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum LlmProviderErrorKind {
    Auth,
    Quota,
    RateLimited,
    BadRequest,
    Unavailable,
    Unreachable,
}

impl LlmProviderErrorKind {
    pub const ALL: [Self; 6] = [
        Self::Auth,
        Self::Quota,
        Self::RateLimited,
        Self::BadRequest,
        Self::Unavailable,
        Self::Unreachable,
    ];

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Auth => "auth",
            Self::Quota => "quota",
            Self::RateLimited => "rate_limited",
            Self::BadRequest => "bad_request",
            Self::Unavailable => "unavailable",
            Self::Unreachable => "unreachable",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|kind| kind.as_str() == value)
    }

    /// What a person reads for this kind. Every client shows it as-is, so it
    /// is written for the settings page and the chat pane, not the log.
    pub const fn user_message(self) -> &'static str {
        match self {
            Self::Auth => "The provider rejected this API key — check it in Settings and try again",
            Self::Quota => "The provider reports this key is out of credit",
            Self::RateLimited => {
                "The provider is rate-limiting this key — wait a moment and try again"
            }
            Self::BadRequest => {
                "The provider rejected the request — check the model name in Settings"
            }
            Self::Unavailable => "The provider is unavailable right now — try again later",
            Self::Unreachable => "Could not reach the provider — check the base URL and try again",
        }
    }
}

/// What is known about a failed call to the user's LLM provider. `detail` is
/// a short excerpt of what the provider said, for logs only: it never
/// appears in the error's message.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LlmProviderFailure {
    pub kind: LlmProviderErrorKind,
    pub provider: Option<String>,
    pub status: Option<u16>,
    pub detail: Option<String>,
}

impl LlmProviderFailure {
    pub fn new(kind: LlmProviderErrorKind) -> Self {
        Self { kind, provider: None, status: None, detail: None }
    }

    pub fn provider(mut self, provider: impl Into<String>) -> Self {
        self.provider = Some(provider.into());
        self
    }

    pub fn status(mut self, status: u16) -> Self {
        self.status = Some(status);
        self
    }

    pub fn detail(mut self, detail: Option<String>) -> Self {
        self.detail = detail;
        self
    }
}

impl DomainError {
    fn coded(code: ErrorCode, message: impl Into<String>) -> Self {
        Self::Coded { code, message: message.into(), llm_provider: None }
    }

    /// The user's LLM provider refused or failed the call. The message is
    /// the per-kind copy plus, when known, which provider and status
    /// ("… (Anthropic error 401)"), since clients show it verbatim.
    pub fn llm_provider(failure: LlmProviderFailure) -> Self {
        let copy = failure.kind.user_message();
        let provider = failure.provider.as_deref().filter(|provider| !provider.is_empty());
        let status = failure.status.filter(|status| *status != 0);
        let message = match (provider, status) {
            (Some(provider), Some(status)) => format!("{copy} ({provider} error {status})"),
            (Some(provider), None) => format!("{copy} ({provider})"),
            (None, _) => copy.to_string(),
        };
        Self::Coded { code: ErrorCode::AiProviderError, message, llm_provider: Some(failure) }
    }

    /// The provider failure behind an `AiProviderError`, when the error was
    /// built by [`DomainError::llm_provider`].
    pub fn llm_provider_failure(&self) -> Option<&LlmProviderFailure> {
        match self {
            Self::Coded { llm_provider, .. } => llm_provider.as_ref(),
            Self::Internal(_) => None,
        }
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
    fn llm_provider_errors_carry_the_kind_and_name_the_provider_and_status() {
        let err = DomainError::llm_provider(
            LlmProviderFailure::new(LlmProviderErrorKind::Auth)
                .provider("Anthropic")
                .status(401)
                .detail(Some("{\"error\":\"invalid x-api-key\"}".to_string())),
        );
        assert_eq!(err.code(), ErrorCode::AiProviderError);
        assert_eq!(
            err.to_string(),
            "The provider rejected this API key — check it in Settings and try again (Anthropic error 401)"
        );
        let failure = err.llm_provider_failure().unwrap();
        assert_eq!(failure.kind, LlmProviderErrorKind::Auth);
        assert_eq!(failure.status, Some(401));
        assert!(!err.to_string().contains("invalid x-api-key"));
    }

    #[test]
    fn llm_provider_errors_without_a_status_name_only_the_provider() {
        let named = DomainError::llm_provider(
            LlmProviderFailure::new(LlmProviderErrorKind::Unreachable).provider("LLM provider"),
        );
        assert_eq!(
            named.to_string(),
            "Could not reach the provider — check the base URL and try again (LLM provider)"
        );
        let bare =
            DomainError::llm_provider(LlmProviderFailure::new(LlmProviderErrorKind::Unavailable));
        assert_eq!(bare.to_string(), "The provider is unavailable right now — try again later");
    }

    #[test]
    fn every_llm_provider_kind_has_its_own_copy_and_round_trips() {
        let expected = [
            ("auth", "The provider rejected this API key — check it in Settings and try again"),
            ("quota", "The provider reports this key is out of credit"),
            (
                "rate_limited",
                "The provider is rate-limiting this key — wait a moment and try again",
            ),
            ("bad_request", "The provider rejected the request — check the model name in Settings"),
            ("unavailable", "The provider is unavailable right now — try again later"),
            ("unreachable", "Could not reach the provider — check the base URL and try again"),
        ];
        for (kind, (name, copy)) in LlmProviderErrorKind::ALL.into_iter().zip(expected) {
            assert_eq!(kind.as_str(), name);
            assert_eq!(kind.user_message(), copy);
            assert_eq!(LlmProviderErrorKind::parse(name), Some(kind));
        }
    }

    #[test]
    fn plain_ai_provider_errors_carry_no_failure() {
        let err = DomainError::ai_provider_error("nope");
        assert_eq!(err.code(), ErrorCode::AiProviderError);
        assert!(err.llm_provider_failure().is_none());
    }

    #[test]
    fn internal_errors_report_the_internal_code() {
        let err = DomainError::internal(std::io::Error::other("connection refused"));
        assert_eq!(err.code(), ErrorCode::InternalError);
    }
}
