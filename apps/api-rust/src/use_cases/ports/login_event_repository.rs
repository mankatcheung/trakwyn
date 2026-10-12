use async_trait::async_trait;

use crate::domain::login_event::LoginEvent;
use crate::use_cases::errors::DomainResult;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateLoginEventData {
    pub id: String,
    pub user_id: String,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
}

#[async_trait]
pub trait LoginEventRepository: Send + Sync {
    async fn create(&self, data: CreateLoginEventData) -> DomainResult<LoginEvent>;
    /// Newest first.
    async fn find_recent_by_user_id(
        &self,
        user_id: &str,
        limit: i64,
    ) -> DomainResult<Vec<LoginEvent>>;
}
