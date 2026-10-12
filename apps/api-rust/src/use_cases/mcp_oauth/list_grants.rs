use std::sync::Arc;

use crate::domain::mcp_oauth::McpOAuthGrant;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::McpOAuthGrantRepository;

/// The MCP clients this user has authorized and not since revoked.
pub struct ListMcpOAuthGrantsUseCase {
    pub mcp_oauth_grant_repository: Arc<dyn McpOAuthGrantRepository>,
}

impl ListMcpOAuthGrantsUseCase {
    pub async fn execute(&self, user_id: &str) -> DomainResult<Vec<McpOAuthGrant>> {
        self.mcp_oauth_grant_repository.find_active_by_user_id(user_id, now()).await
    }
}
