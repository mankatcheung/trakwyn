use std::sync::Arc;

use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::ConversationRepository;

pub struct DeleteConversationInput {
    pub user_id: String,
    pub conversation_id: String,
}

pub struct DeleteConversationUseCase {
    pub conversation_repository: Arc<dyn ConversationRepository>,
}

impl DeleteConversationUseCase {
    pub async fn execute(&self, input: DeleteConversationInput) -> DomainResult<()> {
        let conversation = self
            .conversation_repository
            .find_by_id(&input.conversation_id)
            .await?
            .ok_or_else(|| DomainError::not_found("Conversation not found"))?;
        if conversation.user_id != input.user_id {
            return Err(DomainError::forbidden("Forbidden"));
        }

        self.conversation_repository.delete(&input.conversation_id).await
    }
}
