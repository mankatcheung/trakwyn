use async_trait::async_trait;
use chrono::{DateTime, Utc};

use crate::domain::mcp_oauth::{McpOAuthAccessToken, McpOAuthScope};
use crate::use_cases::errors::DomainResult;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateMcpOAuthAccessTokenData {
    pub id: String,
    pub user_id: String,
    pub client_id: String,
    pub family_id: String,
    pub token_hash: String,
    pub scope: McpOAuthScope,
    pub audience: String,
    pub expires_at: DateTime<Utc>,
}

#[async_trait]
pub trait McpOAuthTokenRepository: Send + Sync {
    async fn create(
        &self,
        data: CreateMcpOAuthAccessTokenData,
    ) -> DomainResult<McpOAuthAccessToken>;
    async fn find_by_token_hash(
        &self,
        token_hash: &str,
    ) -> DomainResult<Option<McpOAuthAccessToken>>;
    async fn update_last_used(&self, id: &str) -> DomainResult<()>;
    async fn revoke(&self, id: &str) -> DomainResult<()>;
    /// Revokes every access token minted under one grant, and returns the
    /// hashes of the ones it actually revoked.
    ///
    /// The return value exists for the caching decorator: it keys tokens by
    /// hash and a grant id tells it nothing about which keys to drop.
    /// Reporting them from the write itself avoids a second query, and means
    /// the set can never disagree with what was revoked.
    async fn revoke_family(
        &self,
        family_id: &str,
        revoked_at: DateTime<Utc>,
    ) -> DomainResult<Vec<String>>;
}
