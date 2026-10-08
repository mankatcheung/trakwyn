//! Where a `DomainError` becomes something a client sees.
//!
//! GraphQL always answers 200, so the HTTP status a code maps to travels in
//! `extensions.statusCode` next to `extensions.code`, exactly as `apps/api`'s
//! `formatError` sends it.

use async_graphql::ErrorExtensions;

use crate::use_cases::errors::{DomainError, ErrorCode};

const INTERNAL_MESSAGE: &str = "Internal server error";

pub const fn status_code(code: ErrorCode) -> u16 {
    match code {
        ErrorCode::Validation | ErrorCode::AiNotConfigured => 400,
        ErrorCode::Unauthorized => 401,
        ErrorCode::Forbidden | ErrorCode::StepUpRequired => 403,
        ErrorCode::NotFound | ErrorCode::UserNotFound => 404,
        ErrorCode::Conflict | ErrorCode::QuotaExceeded => 409,
        ErrorCode::RateLimited | ErrorCode::AiLimitReached => 429,
        ErrorCode::InternalError => 500,
        ErrorCode::AiResponseInvalid | ErrorCode::AiProviderError => 502,
        ErrorCode::ServiceUnavailable => 503,
    }
}

/// Codes a client is expected to cause. Anything else is logged as a server
/// error, since nothing else would record it: the response is a 200.
const fn is_expected(code: ErrorCode) -> bool {
    matches!(
        code,
        ErrorCode::NotFound
            | ErrorCode::Conflict
            | ErrorCode::QuotaExceeded
            | ErrorCode::Unauthorized
            | ErrorCode::Forbidden
            | ErrorCode::RateLimited
            | ErrorCode::AiNotConfigured
            | ErrorCode::AiLimitReached
            | ErrorCode::AiProviderError
            | ErrorCode::StepUpRequired
            | ErrorCode::UserNotFound
    )
}

pub fn to_graphql_error(err: DomainError) -> async_graphql::Error {
    let code = err.code();
    if !is_expected(code) {
        // The error's own text stays in the log: for a failed query it can
        // quote the parameters, which is user data.
        tracing::error!(code = code.as_str(), error = ?err, "[GraphQL error]");
    }

    let message = match &err {
        DomainError::Coded { message, .. } => message.clone(),
        DomainError::Internal(_) => INTERNAL_MESSAGE.to_string(),
    };
    async_graphql::Error::new(message).extend_with(|_, extensions| {
        extensions.set("code", code.as_str());
        extensions.set("statusCode", i32::from(status_code(code)));
    })
}

/// The error for a resolver that needs a signed-in user and has none. Sent
/// with a code and no `statusCode`, as `apps/api`'s resolvers send it.
pub fn unauthorized() -> async_graphql::Error {
    async_graphql::Error::new("Unauthorized").extend_with(|_, extensions| {
        extensions.set("code", ErrorCode::Unauthorized.as_str());
    })
}

pub trait GraphQLResultExt<T> {
    /// Converts a use case's result into a resolver's.
    fn gql(self) -> async_graphql::Result<T>;
}

impl<T> GraphQLResultExt<T> for Result<T, DomainError> {
    fn gql(self) -> async_graphql::Result<T> {
        self.map_err(to_graphql_error)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_graphql::Value;

    fn extension(err: &async_graphql::Error, key: &str) -> Option<Value> {
        err.extensions.as_ref().and_then(|extensions| extensions.get(key)).cloned()
    }

    #[test]
    fn a_coded_error_keeps_its_message_and_gains_a_status() {
        let err = to_graphql_error(DomainError::not_found("Note"));

        assert_eq!(err.message, "Note not found");
        assert_eq!(extension(&err, "code"), Some(Value::from("NOT_FOUND")));
        assert_eq!(extension(&err, "statusCode"), Some(Value::from(404)));
    }

    #[test]
    fn an_internal_error_never_leaks_its_cause() {
        let err = to_graphql_error(DomainError::internal(
            "duplicate key value violates unique constraint (email)=(a@example.com)",
        ));

        assert_eq!(err.message, "Internal server error");
        assert_eq!(extension(&err, "code"), Some(Value::from("INTERNAL_ERROR")));
        assert_eq!(extension(&err, "statusCode"), Some(Value::from(500)));
    }

    #[test]
    fn the_missing_user_error_carries_a_code_only() {
        let err = unauthorized();

        assert_eq!(err.message, "Unauthorized");
        assert_eq!(extension(&err, "code"), Some(Value::from("UNAUTHORIZED")));
        assert_eq!(extension(&err, "statusCode"), None);
    }

    #[test]
    fn every_code_maps_to_the_status_apps_api_sends() {
        let expected = [
            (ErrorCode::Unauthorized, 401),
            (ErrorCode::UserNotFound, 404),
            (ErrorCode::Forbidden, 403),
            (ErrorCode::NotFound, 404),
            (ErrorCode::Conflict, 409),
            (ErrorCode::QuotaExceeded, 409),
            (ErrorCode::Validation, 400),
            (ErrorCode::RateLimited, 429),
            (ErrorCode::InternalError, 500),
            (ErrorCode::ServiceUnavailable, 503),
            (ErrorCode::AiNotConfigured, 400),
            (ErrorCode::AiResponseInvalid, 502),
            (ErrorCode::AiLimitReached, 429),
            (ErrorCode::AiProviderError, 502),
            (ErrorCode::StepUpRequired, 403),
        ];
        for (code, status) in expected {
            assert_eq!(status_code(code), status, "{code}");
        }
    }
}
