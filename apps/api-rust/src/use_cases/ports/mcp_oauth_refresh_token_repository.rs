use async_trait::async_trait;
use chrono::{DateTime, Utc};

use crate::domain::mcp_oauth::{McpOAuthRefreshToken, McpOAuthScope};
use crate::use_cases::errors::DomainResult;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateMcpOAuthRefreshTokenData {
    pub id: String,
    pub token_hash: String,
    pub family_id: String,
    pub client_id: String,
    pub user_id: String,
    pub scope: McpOAuthScope,
    pub expires_at: DateTime<Utc>,
}

#[async_trait]
pub trait McpOAuthRefreshTokenRepository: Send + Sync {
    async fn create(
        &self,
        data: CreateMcpOAuthRefreshTokenData,
    ) -> DomainResult<McpOAuthRefreshToken>;
    async fn find_by_token_hash(
        &self,
        token_hash: &str,
    ) -> DomainResult<Option<McpOAuthRefreshToken>>;
    /// Marks the token used if it has not been already. `false` means it was
    /// already used (or does not exist): the signal of a replayed token.
    async fn mark_used(&self, id: &str, used_at: DateTime<Utc>) -> DomainResult<bool>;
    /// Revokes every refresh token of the grant that is not revoked already.
    async fn revoke_family(&self, family_id: &str, revoked_at: DateTime<Utc>) -> DomainResult<()>;
}
