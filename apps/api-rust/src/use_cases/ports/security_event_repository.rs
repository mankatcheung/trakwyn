use async_trait::async_trait;

use crate::domain::security_event::{SecurityEvent, SecurityEventType};
use crate::use_cases::errors::DomainResult;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateSecurityEventData {
    pub id: String,
    pub user_id: String,
    pub event_type: SecurityEventType,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
}

#[async_trait]
pub trait SecurityEventRepository: Send + Sync {
    async fn create(&self, data: CreateSecurityEventData) -> DomainResult<SecurityEvent>;
    /// Newest first.
    async fn find_recent_by_user_id(
        &self,
        user_id: &str,
        limit: i64,
    ) -> DomainResult<Vec<SecurityEvent>>;
}
