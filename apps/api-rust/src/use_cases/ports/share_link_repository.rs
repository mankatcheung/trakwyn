use async_trait::async_trait;

use crate::domain::share_link::ShareLink;
use crate::use_cases::errors::DomainResult;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateShareLinkData {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub token_hash: String,
}

#[async_trait]
pub trait ShareLinkRepository: Send + Sync {
    /// Newest first.
    async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<ShareLink>>;
    async fn find_by_token_hash(&self, token_hash: &str) -> DomainResult<Option<ShareLink>>;
    async fn find_by_id_and_user_id(
        &self,
        id: &str,
        user_id: &str,
    ) -> DomainResult<Option<ShareLink>>;
    async fn create(&self, data: CreateShareLinkData) -> DomainResult<ShareLink>;
    async fn update_last_used(&self, id: &str) -> DomainResult<()>;
    async fn delete(&self, id: &str) -> DomainResult<()>;
}
