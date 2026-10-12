use async_trait::async_trait;

use crate::domain::message::{Message, MessageRole};
use crate::use_cases::errors::DomainResult;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateMessageData {
    pub id: String,
    pub conversation_id: String,
    pub role: MessageRole,
    pub content: String,
    pub tool_trace: Option<String>,
}

#[async_trait]
pub trait MessageRepository: Send + Sync {
    async fn create(&self, data: CreateMessageData) -> DomainResult<Message>;
    /// Oldest first.
    async fn find_all_by_conversation_id(
        &self,
        conversation_id: &str,
    ) -> DomainResult<Vec<Message>>;
}
