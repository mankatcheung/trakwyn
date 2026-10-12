use async_trait::async_trait;
use chrono::{DateTime, Utc};

use crate::domain::mcp_oauth::McpOAuthGrant;
use crate::use_cases::errors::DomainResult;

#[async_trait]
pub trait McpOAuthGrantRepository: Send + Sync {
    /// Every grant of this user's that a client could still act on: one entry
    /// per consent, not per token, most recently authorized first. A grant is
    /// live while it holds an unrevoked, unexpired refresh token, which is what
    /// lets a client keep minting access tokens; an access token expiring an
    /// hour after it was issued does not mean the client has lost access.
    async fn find_active_by_user_id(
        &self,
        user_id: &str,
        now: DateTime<Utc>,
    ) -> DomainResult<Vec<McpOAuthGrant>>;
}
