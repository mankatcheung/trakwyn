use async_trait::async_trait;

use crate::domain::llm_api_key::LlmApiKey;
use crate::use_cases::errors::DomainResult;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpsertLlmApiKeyData {
    pub id: String,
    pub user_id: String,
    pub provider: String,
    pub api_key: String,
    pub model: Option<String>,
    pub base_url: Option<String>,
}

#[async_trait]
pub trait LlmApiKeyRepository: Send + Sync {
    /// Insert a new key, or replace the existing one for this user+provider.
    async fn upsert(&self, data: UpsertLlmApiKeyData) -> DomainResult<LlmApiKey>;
    async fn find_by_user_id_and_provider(
        &self,
        user_id: &str,
        provider: &str,
    ) -> DomainResult<Option<LlmApiKey>>;
    async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<LlmApiKey>>;
    /// Sets (or clears, with `None`) this key's monthly token ceiling.
    /// Returns `None` when the user has no key for that provider. Separate
    /// from `upsert` so saving a new API key never disturbs the limit already
    /// on it.
    async fn set_monthly_token_limit(
        &self,
        user_id: &str,
        provider: &str,
        monthly_token_limit: Option<i64>,
    ) -> DomainResult<Option<LlmApiKey>>;
    async fn delete(&self, user_id: &str, provider: &str) -> DomainResult<()>;
}
