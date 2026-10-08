use std::sync::Arc;

use crate::domain::message::Message;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{ConversationRepository, MessageRepository};

pub struct GetChatHistoryInput {
    pub user_id: String,
    pub conversation_id: String,
}

pub struct GetChatHistoryUseCase {
    pub message_repository: Arc<dyn MessageRepository>,
    pub conversation_repository: Arc<dyn ConversationRepository>,
}

impl GetChatHistoryUseCase {
    pub async fn execute(&self, input: GetChatHistoryInput) -> DomainResult<Vec<Message>> {
        let conversation = self
            .conversation_repository
            .find_by_id(&input.conversation_id)
            .await?
            .ok_or_else(|| DomainError::not_found("Conversation not found"))?;
        if conversation.user_id != input.user_id {
            return Err(DomainError::forbidden("Forbidden"));
        }

        self.message_repository.find_all_by_conversation_id(&input.conversation_id).await
    }
}
