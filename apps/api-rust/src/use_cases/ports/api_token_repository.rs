use async_trait::async_trait;

use crate::domain::api_token::{ApiToken, ApiTokenScope};
use crate::use_cases::errors::DomainResult;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateApiTokenData {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub token_hash: String,
    pub scope: ApiTokenScope,
}

/// A token together with the email of the user who owns it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApiTokenWithUserEmail {
    pub token: ApiToken,
    pub user_email: String,
}

#[async_trait]
pub trait ApiTokenRepository: Send + Sync {
    /// Newest first.
    async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<ApiToken>>;
    async fn find_by_id(&self, id: &str) -> DomainResult<Option<ApiToken>>;
    async fn find_by_token_hash(
        &self,
        token_hash: &str,
    ) -> DomainResult<Option<ApiTokenWithUserEmail>>;
    async fn create(&self, data: CreateApiTokenData) -> DomainResult<ApiToken>;
    async fn update_last_used(&self, id: &str) -> DomainResult<()>;
    async fn delete(&self, id: &str) -> DomainResult<()>;
    async fn find_by_id_and_user_id(
        &self,
        id: &str,
        user_id: &str,
    ) -> DomainResult<Option<ApiToken>>;
}
