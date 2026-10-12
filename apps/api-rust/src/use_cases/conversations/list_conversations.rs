use std::sync::Arc;

use crate::domain::conversation::Conversation;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::ConversationRepository;

/// Lists a user's conversations, newest-updated first. `limit` bounds the
/// result for surfaces that only show a window: the assistant sidebar shows
/// the ten most recent and must not pull the user's entire history. `None`
/// returns the full history.
pub struct ListConversationsUseCase {
    pub conversation_repository: Arc<dyn ConversationRepository>,
}

impl ListConversationsUseCase {
    pub async fn execute(
        &self,
        user_id: &str,
        limit: Option<i64>,
    ) -> DomainResult<Vec<Conversation>> {
        self.conversation_repository.find_all_by_user_id(user_id, limit).await
    }
}
