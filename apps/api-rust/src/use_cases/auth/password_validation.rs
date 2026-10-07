use crate::use_cases::constants::password::MIN_LENGTH;
use crate::use_cases::errors::{DomainError, DomainResult};

/// Rejects a password shorter than the policy minimum. Length is counted in
/// UTF-16 code units, as `apps/api`'s `password.length` counts it.
pub fn assert_valid_password(password: &str) -> DomainResult<()> {
    if password.encode_utf16().count() < MIN_LENGTH {
        return Err(DomainError::validation(format!(
            "Password must be at least {MIN_LENGTH} characters"
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::use_cases::errors::ErrorCode;

    #[test]
    fn accepts_a_password_of_exactly_the_minimum_length() {
        assert!(assert_valid_password("12345678").is_ok());
    }

    #[test]
    fn rejects_a_shorter_password_with_the_policy_message() {
        let err = assert_valid_password("1234567").unwrap_err();
        assert_eq!(err.code(), ErrorCode::Validation);
        assert_eq!(err.to_string(), "Password must be at least 8 characters");
    }

    #[test]
    fn counts_utf16_code_units_not_bytes_or_scalars() {
        // Four emoji are four scalars, eight UTF-16 units and sixteen bytes.
        assert!(assert_valid_password("😀😀😀😀").is_ok());
        // Seven two-byte letters are fourteen bytes but only seven units.
        assert!(assert_valid_password("ééééééé").is_err());
    }
}
