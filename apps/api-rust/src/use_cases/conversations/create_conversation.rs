use std::sync::Arc;

use crate::domain::conversation::Conversation;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{ConversationRepository, CreateConversationData, LlmApiKeyRepository};
use crate::use_cases::user::llm_api_key_validation::assert_valid_llm_model_id;

pub struct CreateConversationInput {
    pub user_id: String,
    pub provider: Option<String>,
    pub model: Option<String>,
}

pub struct CreateConversationUseCase {
    pub conversation_repository: Arc<dyn ConversationRepository>,
    pub llm_api_key_repository: Arc<dyn LlmApiKeyRepository>,
    pub generate_id: GenerateId,
}

impl CreateConversationUseCase {
    pub async fn execute(&self, input: CreateConversationInput) -> DomainResult<Conversation> {
        // An empty string skips both checks and is stored as it is, exactly
        // as `apps/api` treats a falsy value.
        let non_empty = |value: &Option<String>| value.clone().filter(|value| !value.is_empty());

        // The model is locked in for the conversation and later spliced into a
        // provider URL: same rule as a model saved on a key.
        if let Some(model) = non_empty(&input.model) {
            assert_valid_llm_model_id(&model)?;
        }
        if let Some(provider) = non_empty(&input.provider) {
            let key = self
                .llm_api_key_repository
                .find_by_user_id_and_provider(&input.user_id, &provider)
                .await?;
            if key.is_none() {
                return Err(DomainError::validation("Add an API key for this provider first"));
            }
        }

        self.conversation_repository
            .create(CreateConversationData {
                id: (self.generate_id)(),
                user_id: input.user_id,
                llm_provider: input.provider,
                llm_model: input.model,
            })
            .await
    }
}
