//! Every failure the OAuth callback can report, as a closed set of slugs
//! (`apps/api`'s `oauthErrorSlug.ts`).
//!
//! Never forward a raw error message (or any free-text detail) into the query
//! string instead: it can contain upstream status codes, provider error slugs
//! or this deployment's environment variable names, and the query string ends
//! up in the URL bar, browser history and the Referer header. Only a slug from
//! here crosses that boundary; the client translates it into user-facing text.

use crate::use_cases::errors::{DomainError, ErrorCode};

/// The user pressed Cancel at the provider. Not a fault.
pub const ACCESS_DENIED: &str = "access_denied";
pub const MISSING_CODE: &str = "missing_code";
pub const INVALID_STATE: &str = "invalid_state";
pub const PROVIDER_MISMATCH: &str = "provider_mismatch";
pub const MISSING_USER: &str = "missing_user";
/// Linking: this provider account already belongs to someone else.
pub const ALREADY_LINKED: &str = "already_linked";
/// Signing up: the email is taken, and auto-linking would be a takeover vector.
pub const EMAIL_IN_USE: &str = "email_in_use";
/// Signing up: the provider shared no verified email.
pub const EMAIL_NOT_VERIFIED: &str = "email_not_verified";
/// Signing in: the link exists but its user does not.
pub const ACCOUNT_NOT_FOUND: &str = "account_not_found";
/// Anything else. The real error is logged, never shown.
pub const FAILED: &str = "failed";

/// Maps a failed sign-in by its code, never its message. The same code means
/// different things in the two flows (a conflict while linking is not a
/// conflict while signing up), so the caller says which flow it is in.
pub fn login_error_slug(error: &DomainError) -> &'static str {
    match error.code() {
        ErrorCode::Conflict => EMAIL_IN_USE,
        ErrorCode::Validation => EMAIL_NOT_VERIFIED,
        ErrorCode::NotFound => ACCOUNT_NOT_FOUND,
        _ => FAILED,
    }
}

pub fn link_error_slug(error: &DomainError) -> &'static str {
    if error.code() == ErrorCode::Conflict {
        ALREADY_LINKED
    } else {
        FAILED
    }
}

/// The provider's own `error` param is attacker-influencable text, so it is
/// allow-listed rather than echoed. Only "the user declined" is distinct
/// enough to be worth its own message.
pub fn provider_error_slug(error: &str) -> &'static str {
    if error == ACCESS_DENIED {
        ACCESS_DENIED
    } else {
        FAILED
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_sign_up_maps_codes_to_their_slugs() {
        assert_eq!(login_error_slug(&DomainError::conflict("x")), EMAIL_IN_USE);
        assert_eq!(login_error_slug(&DomainError::validation("x")), EMAIL_NOT_VERIFIED);
        assert_eq!(login_error_slug(&DomainError::not_found("User")), ACCOUNT_NOT_FOUND);
        assert_eq!(login_error_slug(&DomainError::forbidden("x")), FAILED);
        assert_eq!(login_error_slug(&DomainError::internal("boom")), FAILED);
    }

    #[test]
    fn linking_only_distinguishes_a_conflict() {
        assert_eq!(link_error_slug(&DomainError::conflict("x")), ALREADY_LINKED);
        assert_eq!(link_error_slug(&DomainError::validation("x")), FAILED);
    }

    #[test]
    fn a_provider_error_is_allow_listed() {
        assert_eq!(provider_error_slug("access_denied"), ACCESS_DENIED);
        assert_eq!(provider_error_slug("<script>"), FAILED);
    }
}
