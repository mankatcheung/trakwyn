use std::sync::Arc;

use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{LlmApiKeyRepository, UpdateUserData, UserRepository};

pub struct SetDefaultLlmProviderInput {
    pub user_id: String,
    pub provider: String,
}

pub struct SetDefaultLlmProviderUseCase {
    pub user_repository: Arc<dyn UserRepository>,
    pub llm_api_key_repository: Arc<dyn LlmApiKeyRepository>,
}

impl SetDefaultLlmProviderUseCase {
    pub async fn execute(&self, input: SetDefaultLlmProviderInput) -> DomainResult<()> {
        let key = self
            .llm_api_key_repository
            .find_by_user_id_and_provider(&input.user_id, &input.provider)
            .await?;
        if key.is_none() {
            return Err(DomainError::validation(
                "Add an API key for this provider before making it the default",
            ));
        }

        self.user_repository
            .update(
                &input.user_id,
                UpdateUserData {
                    default_llm_provider: Some(Some(input.provider)),
                    ..UpdateUserData::default()
                },
            )
            .await?;
        Ok(())
    }
}
