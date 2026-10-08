use async_trait::async_trait;

use crate::domain::mcp_oauth::McpOAuthClient;
use crate::use_cases::errors::DomainResult;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateMcpOAuthClientData {
    pub id: String,
    pub name: String,
    pub redirect_uris: Vec<String>,
}

#[async_trait]
pub trait McpOAuthClientRepository: Send + Sync {
    async fn create(&self, data: CreateMcpOAuthClientData) -> DomainResult<McpOAuthClient>;
    async fn find_by_id(&self, id: &str) -> DomainResult<Option<McpOAuthClient>>;
}
