use std::sync::Arc;

use chrono::TimeDelta;

use crate::use_cases::auth::token_hashing::{generate_raw_token, hash_token};
use crate::use_cases::clock::now;
use crate::use_cases::constants::password_reset_token::{RANDOM_BYTES, TTL_MS};
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{
    CreatePasswordResetTokenData, EmailService, PasswordResetTokenRepository, RateLimiter,
    UserRepository,
};

pub struct RequestBackupEmailRecoveryInput {
    pub backup_email: String,
    pub ip_address: Option<String>,
}

/// Mails a password-reset link to a verified backup email, for a user who
/// has lost access to their primary address.
pub struct RequestBackupEmailRecoveryUseCase {
    pub user_repository: Arc<dyn UserRepository>,
    pub password_reset_token_repository: Arc<dyn PasswordResetTokenRepository>,
    pub email_service: Arc<dyn EmailService>,
    pub backup_email_recovery_rate_limiter: Arc<dyn RateLimiter>,
    pub generate_id: GenerateId,
    pub web_app_origin: String,
}

impl RequestBackupEmailRecoveryUseCase {
    pub async fn execute(&self, input: RequestBackupEmailRecoveryInput) -> DomainResult<()> {
        let email_allowed = self
            .backup_email_recovery_rate_limiter
            .consume(&format!("backup-email-recovery:email:{}", input.backup_email.to_lowercase()))
            .await;
        let ip_allowed = match input.ip_address.as_deref().filter(|ip| !ip.is_empty()) {
            Some(ip_address) => {
                self.backup_email_recovery_rate_limiter
                    .consume(&format!("backup-email-recovery:ip:{ip_address}"))
                    .await
            }
            None => true,
        };
        if !email_allowed || !ip_allowed {
            return Err(DomainError::rate_limited(
                "Too many backup email recovery requests. Try again later.",
            ));
        }

        let Some(user) = self.user_repository.find_by_backup_email(&input.backup_email).await?
        else {
            return Ok(());
        };
        if user.backup_email_verified_at.is_none() {
            return Ok(());
        }

        self.password_reset_token_repository.delete_all_for_user(&user.id).await?;

        let raw_token = generate_raw_token(RANDOM_BYTES);
        self.password_reset_token_repository
            .create(CreatePasswordResetTokenData {
                id: (self.generate_id)(),
                user_id: user.id.clone(),
                token_hash: hash_token(&raw_token),
                expires_at: now() + TimeDelta::milliseconds(TTL_MS),
            })
            .await?;

        let reset_url = format!("{}/reset-password?token={raw_token}", self.web_app_origin);
        // Email failures are swallowed to prevent account enumeration.
        let _ = self.email_service.send_password_reset(&input.backup_email, &reset_url).await;
        Ok(())
    }
}
