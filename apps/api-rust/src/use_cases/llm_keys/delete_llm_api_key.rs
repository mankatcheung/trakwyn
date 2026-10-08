use std::sync::Arc;

use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{LlmApiKeyRepository, UpdateUserData, UserRepository};

pub struct DeleteLlmApiKeyInput {
    pub user_id: String,
    pub provider: String,
}

pub struct DeleteLlmApiKeyUseCase {
    pub user_repository: Arc<dyn UserRepository>,
    pub llm_api_key_repository: Arc<dyn LlmApiKeyRepository>,
}

impl DeleteLlmApiKeyUseCase {
    pub async fn execute(&self, input: DeleteLlmApiKeyInput) -> DomainResult<()> {
        let user = self
            .user_repository
            .find_by_id(&input.user_id)
            .await?
            .ok_or_else(|| DomainError::not_found("User not found"))?;

        self.llm_api_key_repository.delete(&input.user_id, &input.provider).await?;

        if user.default_llm_provider.as_deref() == Some(input.provider.as_str()) {
            self.user_repository
                .update(
                    &input.user_id,
                    UpdateUserData {
                        default_llm_provider: Some(None),
                        ..UpdateUserData::default()
                    },
                )
                .await?;
        }
        Ok(())
    }
}
