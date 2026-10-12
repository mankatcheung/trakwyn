use std::sync::Arc;

use super::secrets::sha256_hex;
use crate::use_cases::clock::now;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{
    BackupEmailVerificationTokenRepository, UpdateUserData, UserRepository,
};

pub struct ConfirmBackupEmailInput {
    pub token: String,
}

pub struct ConfirmBackupEmailUseCase {
    pub user_repository: Arc<dyn UserRepository>,
    pub backup_email_verification_token_repository: Arc<dyn BackupEmailVerificationTokenRepository>,
}

impl ConfirmBackupEmailUseCase {
    pub async fn execute(&self, input: ConfirmBackupEmailInput) -> DomainResult<()> {
        let token = self
            .backup_email_verification_token_repository
            .find_by_token_hash(&sha256_hex(&input.token))
            .await?
            .filter(|token| token.used_at.is_none() && token.expires_at >= now())
            .ok_or_else(|| DomainError::unauthorized("Invalid or expired confirmation link"))?;

        self.user_repository
            .update(
                &token.user_id,
                UpdateUserData {
                    backup_email: Some(Some(token.new_backup_email)),
                    backup_email_verified_at: Some(Some(now())),
                    ..UpdateUserData::default()
                },
            )
            .await?;

        self.backup_email_verification_token_repository.mark_used(&token.id).await?;
        self.backup_email_verification_token_repository.delete_all_for_user(&token.user_id).await
    }
}
