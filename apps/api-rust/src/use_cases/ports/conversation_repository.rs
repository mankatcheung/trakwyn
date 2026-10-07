use async_trait::async_trait;

use crate::domain::conversation::Conversation;
use crate::use_cases::errors::DomainResult;

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct CreateConversationData {
    pub id: String,
    pub user_id: String,
    pub llm_provider: Option<String>,
    pub llm_model: Option<String>,
}

#[async_trait]
pub trait ConversationRepository: Send + Sync {
    async fn create(&self, data: CreateConversationData) -> DomainResult<Conversation>;
    async fn find_by_id(&self, id: &str) -> DomainResult<Option<Conversation>>;
    /// Newest-updated first, for the conversation list/sidebar. `limit`
    /// bounds the fetch for surfaces that only show a window (the assistant
    /// sidebar); `None` (or a negative value) returns the user's full history.
    async fn find_all_by_user_id(
        &self,
        user_id: &str,
        limit: Option<i64>,
    ) -> DomainResult<Vec<Conversation>>;
    /// Newest-updated first. Matches `search_term` case-insensitively against
    /// conversation titles and message contents; `%` and `_` inside the term
    /// are matched literally.
    async fn search_by_user_id(
        &self,
        user_id: &str,
        search_term: &str,
    ) -> DomainResult<Vec<Conversation>>;
    async fn update_title(&self, id: &str, title: &str) -> DomainResult<()>;
    /// Locks in the provider/model on first use when not chosen at creation time.
    async fn update_llm_settings(
        &self,
        id: &str,
        llm_provider: &str,
        llm_model: Option<&str>,
    ) -> DomainResult<()>;
    async fn delete(&self, id: &str) -> DomainResult<()>;
}
