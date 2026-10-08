use async_trait::async_trait;
use chrono::{DateTime, Utc};

use crate::domain::backup_email_verification_token::BackupEmailVerificationToken;
use crate::use_cases::errors::DomainResult;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateBackupEmailVerificationTokenData {
    pub id: String,
    pub user_id: String,
    pub token_hash: String,
    pub new_backup_email: String,
    pub expires_at: DateTime<Utc>,
}

#[async_trait]
pub trait BackupEmailVerificationTokenRepository: Send + Sync {
    async fn create(
        &self,
        data: CreateBackupEmailVerificationTokenData,
    ) -> DomainResult<BackupEmailVerificationToken>;
    async fn find_by_token_hash(
        &self,
        token_hash: &str,
    ) -> DomainResult<Option<BackupEmailVerificationToken>>;
    async fn mark_used(&self, id: &str) -> DomainResult<()>;
    async fn delete_all_for_user(&self, user_id: &str) -> DomainResult<()>;
}
