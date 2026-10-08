use async_trait::async_trait;
use chrono::{DateTime, Utc};

use crate::domain::mcp_oauth::{
    McpOAuthAuthorizationCode, McpOAuthCodeChallengeMethod, McpOAuthScope,
};
use crate::use_cases::errors::DomainResult;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateMcpOAuthAuthorizationCodeData {
    pub id: String,
    pub code_hash: String,
    pub family_id: String,
    pub client_id: String,
    pub user_id: String,
    pub redirect_uri: String,
    pub scope: McpOAuthScope,
    pub code_challenge: String,
    pub code_challenge_method: McpOAuthCodeChallengeMethod,
    pub expires_at: DateTime<Utc>,
}

#[async_trait]
pub trait McpOAuthAuthorizationCodeRepository: Send + Sync {
    async fn create(
        &self,
        data: CreateMcpOAuthAuthorizationCodeData,
    ) -> DomainResult<McpOAuthAuthorizationCode>;
    async fn find_by_code_hash(
        &self,
        code_hash: &str,
    ) -> DomainResult<Option<McpOAuthAuthorizationCode>>;
    /// Marks the code consumed if it has not been already. `false` means it
    /// was already consumed (or does not exist), so a code is redeemed once.
    async fn consume(&self, id: &str, consumed_at: DateTime<Utc>) -> DomainResult<bool>;
}
