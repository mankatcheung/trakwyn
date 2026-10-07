use async_trait::async_trait;

use crate::domain::push_subscription::{PushSubscription, PushSubscriptionProvider};
use crate::use_cases::errors::DomainResult;

/// A `PushSubscription` without its timestamps.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpsertPushSubscriptionData {
    pub id: String,
    pub user_id: String,
    pub provider: PushSubscriptionProvider,
    pub endpoint: String,
    pub p256dh: Option<String>,
    pub auth: Option<String>,
}

#[async_trait]
pub trait PushSubscriptionRepository: Send + Sync {
    async fn find_by_user_id(&self, user_id: &str) -> DomainResult<Vec<PushSubscription>>;
    async fn find_by_endpoint(&self, endpoint: &str) -> DomainResult<Option<PushSubscription>>;
    /// Inserts, or on an endpoint that is already stored re-points that row
    /// at this user and key material. The returned value echoes the input
    /// with fresh timestamps; on a conflict the stored row keeps its original
    /// `id` and `created_at`.
    async fn upsert(
        &self,
        subscription: UpsertPushSubscriptionData,
    ) -> DomainResult<PushSubscription>;
    async fn delete_by_endpoint(&self, endpoint: &str) -> DomainResult<()>;
    async fn delete_by_user_id(&self, user_id: &str) -> DomainResult<()>;
}
