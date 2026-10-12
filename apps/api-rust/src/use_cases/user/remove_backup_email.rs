use std::sync::Arc;

use super::password_hashing::verify_password;
use crate::use_cases::auth::{assert_has_password, is_session_fresh, SessionAuthTime};
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{
    BackupEmailVerificationTokenRepository, RateLimiter, UpdateUserData, UserRepository,
};

pub struct RemoveBackupEmailInput {
    pub user_id: String,
    pub current_password: String,
    pub auth_time: SessionAuthTime,
}

pub struct RemoveBackupEmailUseCase {
    pub user_repository: Arc<dyn UserRepository>,
    pub backup_email_verification_token_repository: Arc<dyn BackupEmailVerificationTokenRepository>,
    pub remove_backup_email_rate_limiter: Arc<dyn RateLimiter>,
}

impl RemoveBackupEmailUseCase {
    pub async fn execute(&self, input: RemoveBackupEmailInput) -> DomainResult<()> {
        let key = format!("remove-backup-email:user:{}", input.user_id);
        if !self.remove_backup_email_rate_limiter.consume(&key).await {
            return Err(DomainError::rate_limited("Too many requests. Try again later."));
        }

        let user = self
            .user_repository
            .find_by_id(&input.user_id)
            .await?
            .ok_or_else(|| DomainError::not_found("User not found"))?;
        let password_hash = assert_has_password(user.password_hash.as_deref())?;

        if !verify_password(&input.current_password, password_hash).await? {
            return Err(DomainError::unauthorized("Invalid password"));
        }

        if user.totp_enabled && !is_session_fresh(input.auth_time) {
            return Err(DomainError::step_up_required(
                "Please verify your identity again to continue.",
            ));
        }

        self.user_repository
            .update(
                &input.user_id,
                UpdateUserData {
                    backup_email: Some(None),
                    backup_email_verified_at: Some(None),
                    ..UpdateUserData::default()
                },
            )
            .await?;

        self.backup_email_verification_token_repository.delete_all_for_user(&input.user_id).await
    }
}
