use async_trait::async_trait;

use crate::domain::oauth_account::{OAuthAccount, OAuthProviderName};
use crate::use_cases::errors::DomainResult;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateOAuthAccountData {
    pub id: String,
    pub user_id: String,
    pub provider: OAuthProviderName,
    pub provider_account_id: String,
    pub email: Option<String>,
}

#[async_trait]
pub trait OAuthAccountRepository: Send + Sync {
    async fn find_by_provider(
        &self,
        provider: OAuthProviderName,
        provider_account_id: &str,
    ) -> DomainResult<Option<OAuthAccount>>;
    /// In no particular order.
    async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<OAuthAccount>>;
    async fn create(&self, data: CreateOAuthAccountData) -> DomainResult<OAuthAccount>;
    async fn delete(&self, id: &str) -> DomainResult<()>;
}
