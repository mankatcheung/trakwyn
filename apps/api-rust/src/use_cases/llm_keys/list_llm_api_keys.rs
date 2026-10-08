use std::sync::Arc;

use crate::domain::llm_api_key::LlmApiKey;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::LlmApiKeyRepository;

pub struct ListLlmApiKeysUseCase {
    pub llm_api_key_repository: Arc<dyn LlmApiKeyRepository>,
}

impl ListLlmApiKeysUseCase {
    /// The rows as stored: `api_key` is still ciphertext, and the transport
    /// layer exposes none of it.
    pub async fn execute(&self, user_id: &str) -> DomainResult<Vec<LlmApiKey>> {
        self.llm_api_key_repository.find_all_by_user_id(user_id).await
    }
}
