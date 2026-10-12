use crate::use_cases::constants::document_upload::{ALLOWED_MIME_TYPES, MAX_SIZE_BYTES};
use crate::use_cases::errors::{DomainError, DomainResult};

pub fn assert_allowed_mime_type(mime_type: &str) -> DomainResult<()> {
    if !ALLOWED_MIME_TYPES.contains(&mime_type) {
        return Err(DomainError::validation(format!("Unsupported file type: {mime_type}")));
    }
    Ok(())
}

pub fn assert_valid_size_bytes(size_bytes: i32) -> DomainResult<()> {
    if size_bytes <= 0 {
        return Err(DomainError::validation("File size must be greater than 0 bytes"));
    }
    if size_bytes > MAX_SIZE_BYTES {
        return Err(DomainError::validation(format!(
            "File exceeds the maximum allowed size of {MAX_SIZE_BYTES} bytes"
        )));
    }
    Ok(())
}

/// Whether `storage_key` is one `RequestUploadUrlUseCase` could have minted
/// for this user and application.
pub fn is_owned_upload_key(storage_key: &str, user_id: &str, application_id: &str) -> bool {
    let prefix = format!("users/{user_id}/applications/{application_id}/");
    storage_key.starts_with(&prefix) && !storage_key.contains("..")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::use_cases::errors::ErrorCode;

    #[test]
    fn accepts_every_allowed_mime_type() {
        for mime_type in ALLOWED_MIME_TYPES {
            assert!(assert_allowed_mime_type(mime_type).is_ok(), "{mime_type}");
        }
    }

    #[test]
    fn refuses_a_mime_type_outside_the_list_naming_it() {
        let err = assert_allowed_mime_type("application/zip").unwrap_err();

        assert_eq!(err.code(), ErrorCode::Validation);
        assert_eq!(err.to_string(), "Unsupported file type: application/zip");
        // An exact match, not a prefix or a parameterised type.
        assert!(assert_allowed_mime_type("application/pdf; charset=utf-8").is_err());
        assert!(assert_allowed_mime_type("").is_err());
    }

    #[test]
    fn refuses_a_size_that_is_not_positive() {
        for size in [0, -1] {
            let err = assert_valid_size_bytes(size).unwrap_err();
            assert_eq!(err.code(), ErrorCode::Validation);
            assert_eq!(err.to_string(), "File size must be greater than 0 bytes");
        }
    }

    #[test]
    fn accepts_a_size_up_to_the_cap_and_refuses_one_byte_more() {
        assert!(assert_valid_size_bytes(1).is_ok());
        assert!(assert_valid_size_bytes(MAX_SIZE_BYTES).is_ok());

        let err = assert_valid_size_bytes(MAX_SIZE_BYTES + 1).unwrap_err();
        assert_eq!(err.code(), ErrorCode::Validation);
        assert_eq!(err.to_string(), "File exceeds the maximum allowed size of 10485760 bytes");
    }

    #[test]
    fn a_key_is_owned_only_under_the_users_application_prefix() {
        assert!(is_owned_upload_key("users/u1/applications/a1/x-cv.pdf", "u1", "a1"));
        assert!(!is_owned_upload_key("users/u2/applications/a1/x-cv.pdf", "u1", "a1"));
        assert!(!is_owned_upload_key("users/u1/applications/a2/x-cv.pdf", "u1", "a1"));
        assert!(!is_owned_upload_key("users/u1/applications/a1/../a2/x.pdf", "u1", "a1"));
        assert!(!is_owned_upload_key("documents/a1/doc.pdf", "u1", "a1"));
    }
}
