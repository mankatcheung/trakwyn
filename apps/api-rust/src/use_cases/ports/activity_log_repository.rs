use async_trait::async_trait;

use crate::domain::activity_log::{ActivityEventType, ActivityLog};
use crate::use_cases::errors::DomainResult;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppendActivityLogData {
    pub id: String,
    pub application_id: String,
    pub actor_id: String,
    pub event_type: ActivityEventType,
    pub payload: String,
}

#[async_trait]
pub trait ActivityLogRepository: Send + Sync {
    async fn find_all_by_application_id(
        &self,
        application_id: &str,
    ) -> DomainResult<Vec<ActivityLog>>;
    /// Across every application the user owns, for cross-application analytics.
    async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<ActivityLog>>;
    async fn append(&self, data: AppendActivityLogData) -> DomainResult<ActivityLog>;
}
