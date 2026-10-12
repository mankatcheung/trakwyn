use std::sync::Arc;

use crate::domain::user::User;
use crate::use_cases::auth::log_auth_failure::{log_auth_failure, AuthFailureReason};
use crate::use_cases::auth::password_hash_guard::assert_has_password;
use crate::use_cases::auth::password_hashing::verify_password;
use crate::use_cases::auth::verify_totp_or_backup_code::verify_totp_or_backup_code;
use crate::use_cases::constants::auth_failure_events;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::logger::Logger;
use crate::use_cases::ports::{
    RateLimiter, TotpBackupCodeRepository, TotpProvider, UserRepository,
};

pub struct LoginWithTotpInput {
    pub email: String,
    pub password: String,
    pub code: String,
    pub ip_address: Option<String>,
}

pub struct LoginWithTotpUseCase {
    pub user_repository: Arc<dyn UserRepository>,
    pub totp_backup_code_repository: Arc<dyn TotpBackupCodeRepository>,
    pub totp_rate_limiter: Arc<dyn RateLimiter>,
    pub totp_provider: Arc<dyn TotpProvider>,
    pub logger: Arc<dyn Logger>,
}

fn invalid_credentials() -> DomainError {
    DomainError::unauthorized("Invalid credentials")
}

impl LoginWithTotpUseCase {
    pub async fn execute(&self, input: LoginWithTotpInput) -> DomainResult<User> {
        let Some(user) = self.user_repository.find_by_email(&input.email).await? else {
            self.log_failure(AuthFailureReason::InvalidCredentials, None);
            return Err(invalid_credentials());
        };

        if user.password_hash.is_none() {
            self.log_failure(AuthFailureReason::NoPassword, None);
        }
        let password_hash = assert_has_password(user.password_hash.as_deref())?;
        if !verify_password(&input.password, password_hash).await? {
            self.log_failure(AuthFailureReason::InvalidCredentials, None);
            return Err(invalid_credentials());
        }

        let totp_secret = user.totp_secret.as_deref().filter(|secret| !secret.is_empty());
        let Some(totp_secret) = totp_secret.filter(|_| user.totp_enabled) else {
            self.log_failure(AuthFailureReason::InvalidCredentials, None);
            return Err(invalid_credentials());
        };

        // Both keys are consumed before either answer is looked at.
        let allowed_by_email = self
            .totp_rate_limiter
            .consume(&format!("totp:email:{}", input.email.to_lowercase()))
            .await;
        let allowed_by_ip = match input.ip_address.as_deref().filter(|ip| !ip.is_empty()) {
            Some(ip_address) => {
                self.totp_rate_limiter.consume(&format!("totp:ip:{ip_address}")).await
            }
            None => true,
        };
        if !allowed_by_email || !allowed_by_ip {
            return Err(DomainError::rate_limited(
                "Too many verification attempts. Please try again later.",
            ));
        }

        let valid_code = verify_totp_or_backup_code(
            self.totp_provider.as_ref(),
            self.totp_backup_code_repository.as_ref(),
            &user.id,
            totp_secret,
            &input.code,
        )
        .await?;
        if !valid_code {
            // The password was right, so this account's password is known to
            // whoever is guessing codes: the user id is what makes that visible.
            self.log_failure(AuthFailureReason::InvalidCode, Some(&user.id));
            return Err(DomainError::unauthorized("Invalid verification code"));
        }

        Ok(user)
    }

    fn log_failure(&self, reason: AuthFailureReason, user_id: Option<&str>) {
        log_auth_failure(self.logger.as_ref(), auth_failure_events::TOTP_FAILED, reason, user_id);
    }
}
