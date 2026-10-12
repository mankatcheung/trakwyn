use async_trait::async_trait;
use chrono::{DateTime, Utc};

use crate::domain::password_reset_token::PasswordResetToken;
use crate::use_cases::errors::DomainResult;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreatePasswordResetTokenData {
    pub id: String,
    pub user_id: String,
    pub token_hash: String,
    pub expires_at: DateTime<Utc>,
}

#[async_trait]
pub trait PasswordResetTokenRepository: Send + Sync {
    async fn create(&self, data: CreatePasswordResetTokenData) -> DomainResult<PasswordResetToken>;
    async fn find_by_token_hash(
        &self,
        token_hash: &str,
    ) -> DomainResult<Option<PasswordResetToken>>;
    async fn mark_used(&self, id: &str) -> DomainResult<()>;
    async fn delete_all_for_user(&self, user_id: &str) -> DomainResult<()>;
}
