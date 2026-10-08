use crate::use_cases::constants::password::MIN_LENGTH;
use crate::use_cases::errors::{DomainError, DomainResult};

/// Length is counted in UTF-16 code units, which is what JavaScript's
/// `String.length` counts: a password both implementations must agree on.
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
    fn accepts_eight_characters() {
        assert!(assert_valid_password("12345678").is_ok());
    }

    #[test]
    fn refuses_seven_characters() {
        let err = assert_valid_password("1234567").unwrap_err();

        assert_eq!(err.code(), ErrorCode::Validation);
        assert_eq!(err.to_string(), "Password must be at least 8 characters");
    }

    #[test]
    fn counts_utf16_code_units_as_javascript_does() {
        // Four emoji are four characters but eight UTF-16 code units.
        assert!(assert_valid_password("😀😀😀😀").is_ok());
        // Seven two-byte letters are fourteen bytes but seven code units.
        assert!(assert_valid_password("ééééééé").is_err());
    }
}
