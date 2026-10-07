//! The conversation half of `apps/api`'s `http/di/use-cases/chat.ts`. The
//! chat use cases themselves need an LLM and are wired with it.

use crate::http::container::Container;
use crate::use_cases::conversations::{
    CreateConversationUseCase, DeleteConversationUseCase, ListConversationsUseCase,
    SearchConversationsUseCase,
};

impl Container {
    pub fn create_conversation_use_case(&self) -> CreateConversationUseCase {
        CreateConversationUseCase {
            conversation_repository: self.conversation_repository.clone(),
            llm_api_key_repository: self.llm_api_key_repository.clone(),
            generate_id: self.generate_id.clone(),
        }
    }

    pub fn list_conversations_use_case(&self) -> ListConversationsUseCase {
        ListConversationsUseCase { conversation_repository: self.conversation_repository.clone() }
    }

    pub fn search_conversations_use_case(&self) -> SearchConversationsUseCase {
        SearchConversationsUseCase { conversation_repository: self.conversation_repository.clone() }
    }

    pub fn delete_conversation_use_case(&self) -> DeleteConversationUseCase {
        DeleteConversationUseCase { conversation_repository: self.conversation_repository.clone() }
    }
}
