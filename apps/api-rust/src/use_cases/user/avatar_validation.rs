use crate::use_cases::constants::avatar::{ALLOWED_MIME_TYPES, MAX_SIZE_BYTES};
use crate::use_cases::errors::{DomainError, DomainResult};

pub fn assert_allowed_avatar_mime_type(mime_type: &str) -> DomainResult<()> {
    if !ALLOWED_MIME_TYPES.contains(&mime_type) {
        return Err(DomainError::validation(format!("Unsupported image type: {mime_type}")));
    }
    Ok(())
}

pub fn assert_valid_avatar_size_bytes(size_bytes: i32) -> DomainResult<()> {
    if size_bytes <= 0 {
        return Err(DomainError::validation("Image size must be greater than 0 bytes"));
    }
    if size_bytes > MAX_SIZE_BYTES {
        return Err(DomainError::validation(format!(
            "Image exceeds the maximum allowed size of {MAX_SIZE_BYTES} bytes"
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::use_cases::errors::ErrorCode;

    #[test]
    fn allows_png_jpeg_and_webp() {
        for mime_type in ["image/png", "image/jpeg", "image/webp"] {
            assert!(assert_allowed_avatar_mime_type(mime_type).is_ok(), "{mime_type}");
        }
    }

    #[test]
    fn refuses_any_other_type_naming_it() {
        let err = assert_allowed_avatar_mime_type("application/pdf").unwrap_err();
        assert_eq!(err.code(), ErrorCode::Validation);
        assert_eq!(err.to_string(), "Unsupported image type: application/pdf");
        // The match is exact: no case folding, no parameters.
        assert!(assert_allowed_avatar_mime_type("IMAGE/PNG").is_err());
    }

    #[test]
    fn refuses_an_empty_or_negative_size() {
        for size in [0, -1] {
            let err = assert_valid_avatar_size_bytes(size).unwrap_err();
            assert_eq!(err.code(), ErrorCode::Validation);
            assert_eq!(err.to_string(), "Image size must be greater than 0 bytes");
        }
    }

    #[test]
    fn allows_up_to_the_limit_and_refuses_one_byte_more() {
        assert!(assert_valid_avatar_size_bytes(1).is_ok());
        assert!(assert_valid_avatar_size_bytes(MAX_SIZE_BYTES).is_ok());

        let err = assert_valid_avatar_size_bytes(MAX_SIZE_BYTES + 1).unwrap_err();
        assert_eq!(err.code(), ErrorCode::Validation);
        assert_eq!(err.to_string(), "Image exceeds the maximum allowed size of 5242880 bytes");
    }
}
