use std::sync::Mutex;

use async_trait::async_trait;

use crate::domain::llm_api_key::LlmApiKey;
use crate::use_cases::clock::now;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{LlmApiKeyRepository, UpsertLlmApiKeyData};

#[derive(Default)]
pub struct FakeLlmApiKeyRepository {
    keys: Mutex<Vec<LlmApiKey>>,
}

impl FakeLlmApiKeyRepository {
    pub fn with(keys: Vec<LlmApiKey>) -> Self {
        Self { keys: Mutex::new(keys) }
    }

    pub fn all(&self) -> Vec<LlmApiKey> {
        self.keys.lock().unwrap().clone()
    }
}

#[async_trait]
impl LlmApiKeyRepository for FakeLlmApiKeyRepository {
    async fn upsert(&self, data: UpsertLlmApiKeyData) -> DomainResult<LlmApiKey> {
        let mut keys = self.keys.lock().unwrap();
        let timestamp = now();
        if let Some(existing) =
            keys.iter_mut().find(|key| key.user_id == data.user_id && key.provider == data.provider)
        {
            existing.api_key = data.api_key;
            existing.model = data.model;
            existing.base_url = data.base_url;
            existing.updated_at = timestamp;
            return Ok(existing.clone());
        }
        if keys.iter().any(|key| key.id == data.id) {
            return Err(DomainError::internal("duplicate LlmApiKey id"));
        }
        let key = LlmApiKey {
            id: data.id,
            user_id: data.user_id,
            provider: data.provider,
            api_key: data.api_key,
            model: data.model,
            base_url: data.base_url,
            monthly_token_limit: None,
            created_at: timestamp,
            updated_at: timestamp,
        };
        keys.push(key.clone());
        Ok(key)
    }

    async fn find_by_user_id_and_provider(
        &self,
        user_id: &str,
        provider: &str,
    ) -> DomainResult<Option<LlmApiKey>> {
        Ok(self.all().into_iter().find(|key| key.user_id == user_id && key.provider == provider))
    }

    async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<LlmApiKey>> {
        Ok(self.all().into_iter().filter(|key| key.user_id == user_id).collect())
    }

    async fn set_monthly_token_limit(
        &self,
        user_id: &str,
        provider: &str,
        monthly_token_limit: Option<i64>,
    ) -> DomainResult<Option<LlmApiKey>> {
        let mut keys = self.keys.lock().unwrap();
        let Some(key) =
            keys.iter_mut().find(|key| key.user_id == user_id && key.provider == provider)
        else {
            return Ok(None);
        };
        key.monthly_token_limit = monthly_token_limit;
        key.updated_at = now();
        Ok(Some(key.clone()))
    }

    async fn delete(&self, user_id: &str, provider: &str) -> DomainResult<()> {
        self.keys
            .lock()
            .unwrap()
            .retain(|key| !(key.user_id == user_id && key.provider == provider));
        Ok(())
    }
}
