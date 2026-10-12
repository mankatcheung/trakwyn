use async_trait::async_trait;
use chrono::{DateTime, Utc};

use crate::domain::email_verification_token::EmailVerificationToken;
use crate::use_cases::errors::DomainResult;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateEmailVerificationTokenData {
    pub id: String,
    pub user_id: String,
    pub token_hash: String,
    /// Only for an email-change confirmation token.
    pub new_email: Option<String>,
    pub expires_at: DateTime<Utc>,
}

#[async_trait]
pub trait EmailVerificationTokenRepository: Send + Sync {
    async fn create(
        &self,
        data: CreateEmailVerificationTokenData,
    ) -> DomainResult<EmailVerificationToken>;
    async fn find_by_token_hash(
        &self,
        token_hash: &str,
    ) -> DomainResult<Option<EmailVerificationToken>>;
    async fn mark_used(&self, id: &str) -> DomainResult<()>;
    async fn delete_all_for_user(&self, user_id: &str) -> DomainResult<()>;
}
