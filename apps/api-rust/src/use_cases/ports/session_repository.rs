use async_trait::async_trait;
use chrono::{DateTime, Utc};

use crate::domain::session::Session;
use crate::use_cases::errors::DomainResult;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateSessionData {
    pub id: String,
    pub user_id: String,
    pub user_agent: Option<String>,
    pub ip_address: Option<String>,
    pub device_label: Option<String>,
    pub location: Option<String>,
    pub expires_at: DateTime<Utc>,
    pub current_refresh_token_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RotateRefreshTokenData {
    pub current_refresh_token_id: String,
    pub previous_refresh_token_id: String,
    pub previous_rotated_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
}

#[async_trait]
pub trait SessionRepository: Send + Sync {
    async fn create(&self, data: CreateSessionData) -> DomainResult<Session>;
    async fn find_by_id(&self, id: &str) -> DomainResult<Option<Session>>;
    async fn find_by_id_and_user_id(
        &self,
        id: &str,
        user_id: &str,
    ) -> DomainResult<Option<Session>>;
    /// Neither revoked nor expired, most recently used first.
    async fn find_active_by_user_id(&self, user_id: &str) -> DomainResult<Vec<Session>>;
    /// Marks the session used now and moves its expiry.
    async fn touch(&self, id: &str, expires_at: DateTime<Utc>) -> DomainResult<()>;
    async fn rotate_refresh_token(
        &self,
        id: &str,
        data: RotateRefreshTokenData,
    ) -> DomainResult<()>;
    async fn revoke(&self, id: &str) -> DomainResult<()>;
    async fn revoke_all_for_user_except(&self, user_id: &str, except_id: &str) -> DomainResult<()>;
    async fn revoke_all_for_user(&self, user_id: &str) -> DomainResult<()>;
    /// All distinct userAgent fingerprints previously used by this user.
    async fn find_distinct_user_agents_by_user_id(
        &self,
        user_id: &str,
    ) -> DomainResult<Vec<String>>;
}
