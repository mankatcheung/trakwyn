use std::sync::Arc;

use crate::domain::user::User;
use crate::use_cases::auth::password_hash_guard::assert_has_password;
use crate::use_cases::auth::password_hashing::verify_password;
use crate::use_cases::auth::verify_totp_or_backup_code::verify_totp_or_backup_code;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{
    RateLimiter, TotpBackupCodeRepository, TotpProvider, UserRepository,
};

pub struct ReauthenticateInput {
    pub user_id: String,
    pub password: String,
    /// Only required when the user has 2FA enabled.
    pub code: Option<String>,
}

#[derive(Debug)]
pub struct ReauthenticateOutput {
    pub user: User,
    /// True when the password was valid but a TOTP code is still needed: the
    /// caller should re-submit with `code`.
    pub totp_required: bool,
}

/// Re-proves an already-authenticated user's identity (password, plus a TOTP
/// code if 2FA is enabled) for step-up auth (JEF-44). Distinct from
/// `LoginUseCase` and `LoginWithTotpUseCase`, which authenticate by email for
/// a brand new session: this looks the user up by id (the caller is already
/// logged in) and does not touch sessions. The resolver re-signs tokens for
/// the existing session once this succeeds.
pub struct ReauthenticateUseCase {
    pub user_repository: Arc<dyn UserRepository>,
    pub totp_backup_code_repository: Arc<dyn TotpBackupCodeRepository>,
    pub totp_rate_limiter: Arc<dyn RateLimiter>,
    pub totp_provider: Arc<dyn TotpProvider>,
}

fn invalid_credentials() -> DomainError {
    DomainError::unauthorized("Invalid credentials")
}

impl ReauthenticateUseCase {
    pub async fn execute(&self, input: ReauthenticateInput) -> DomainResult<ReauthenticateOutput> {
        let user = self
            .user_repository
            .find_by_id(&input.user_id)
            .await?
            .ok_or_else(invalid_credentials)?;
        let password_hash = assert_has_password(user.password_hash.as_deref())?;

        if !verify_password(&input.password, password_hash).await? {
            return Err(invalid_credentials());
        }

        let totp_secret = user.totp_secret.clone().filter(|secret| !secret.is_empty());
        let Some(totp_secret) = totp_secret.filter(|_| user.totp_enabled) else {
            return Ok(ReauthenticateOutput { user, totp_required: false });
        };

        let Some(code) = input.code.filter(|code| !code.is_empty()) else {
            return Ok(ReauthenticateOutput { user, totp_required: true });
        };

        if !self.totp_rate_limiter.consume(&format!("totp:stepup:user:{}", user.id)).await {
            return Err(DomainError::rate_limited(
                "Too many verification attempts. Please try again later.",
            ));
        }

        let valid_code = verify_totp_or_backup_code(
            self.totp_provider.as_ref(),
            self.totp_backup_code_repository.as_ref(),
            &user.id,
            &totp_secret,
            &code,
        )
        .await?;
        if !valid_code {
            return Err(DomainError::unauthorized("Invalid verification code"));
        }

        Ok(ReauthenticateOutput { user, totp_required: false })
    }
}
