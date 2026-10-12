use crate::use_cases::auth::token_hashing::hash_token;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{TotpBackupCodeRepository, TotpProvider};

const TOTP_CODE_LENGTH: usize = 6;

/// TOTP codes are always six ASCII digits; anything else can only be a
/// backup code.
fn is_totp_format(code: &str) -> bool {
    code.len() == TOTP_CODE_LENGTH && code.bytes().all(|byte| byte.is_ascii_digit())
}

/// Verifies a 6-digit TOTP code against the user's stored (encrypted) secret,
/// falling back to a hashed single-use backup code, which is spent on success.
pub async fn verify_totp_or_backup_code(
    totp_provider: &dyn TotpProvider,
    totp_backup_code_repository: &dyn TotpBackupCodeRepository,
    user_id: &str,
    encrypted_totp_secret: &str,
    code: &str,
) -> DomainResult<bool> {
    // Decrypted before the shape of the code is looked at, as in `apps/api`:
    // an unreadable secret fails the attempt whatever was typed.
    let secret = totp_provider.decrypt_secret(encrypted_totp_secret)?;
    if is_totp_format(code) && totp_provider.verify_code(&secret, code)? {
        return Ok(true);
    }

    let backup_code = totp_backup_code_repository.find_by_code_hash(&hash_token(code)).await?;
    let Some(backup_code) = backup_code
        .filter(|backup_code| backup_code.user_id == user_id && backup_code.used_at.is_none())
    else {
        return Ok(false);
    };

    totp_backup_code_repository.mark_used(&backup_code.id).await?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_six_ascii_digits_are_a_totp_code() {
        assert!(is_totp_format("123456"));
        assert!(!is_totp_format("12345"));
        assert!(!is_totp_format("1234567"));
        assert!(!is_totp_format("12345a"));
        assert!(!is_totp_format("123456\n"));
        // Six digits to Unicode, not to `/^\d{6}$/`.
        assert!(!is_totp_format("１２"));
    }
}
