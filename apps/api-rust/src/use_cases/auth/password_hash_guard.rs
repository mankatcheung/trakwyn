use crate::use_cases::errors::{DomainError, DomainResult};

/// OAuth-only accounts have no password hash, so every password-confirmation
/// call site checks this before comparing.
pub fn assert_has_password(password_hash: Option<&str>) -> DomainResult<&str> {
    password_hash.ok_or_else(|| {
        DomainError::unauthorized(
            "This account has no password set. Sign in with a linked provider instead.",
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::use_cases::errors::ErrorCode;

    #[test]
    fn passes_a_set_password_hash_through() {
        assert_eq!(assert_has_password(Some("hash")).unwrap(), "hash");
    }

    #[test]
    fn is_unauthorized_when_there_is_no_hash() {
        let err = assert_has_password(None).unwrap_err();

        assert_eq!(err.code(), ErrorCode::Unauthorized);
        assert_eq!(
            err.to_string(),
            "This account has no password set. Sign in with a linked provider instead."
        );
    }
}
