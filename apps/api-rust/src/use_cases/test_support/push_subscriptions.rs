use std::sync::Mutex;

use async_trait::async_trait;

use crate::domain::push_subscription::PushSubscription;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{PushSubscriptionRepository, UpsertPushSubscriptionData};

#[derive(Default)]
pub struct FakePushSubscriptionRepository {
    subscriptions: Mutex<Vec<PushSubscription>>,
}

impl FakePushSubscriptionRepository {
    pub fn with(subscriptions: Vec<PushSubscription>) -> Self {
        Self { subscriptions: Mutex::new(subscriptions) }
    }

    /// What is stored, which after a conflicting upsert is not what the
    /// upsert returned.
    pub fn all(&self) -> Vec<PushSubscription> {
        self.subscriptions.lock().unwrap().clone()
    }
}

#[async_trait]
impl PushSubscriptionRepository for FakePushSubscriptionRepository {
    async fn find_by_user_id(&self, user_id: &str) -> DomainResult<Vec<PushSubscription>> {
        Ok(self.all().into_iter().filter(|subscription| subscription.user_id == user_id).collect())
    }

    async fn find_by_endpoint(&self, endpoint: &str) -> DomainResult<Option<PushSubscription>> {
        Ok(self.all().into_iter().find(|subscription| subscription.endpoint == endpoint))
    }

    async fn upsert(
        &self,
        subscription: UpsertPushSubscriptionData,
    ) -> DomainResult<PushSubscription> {
        let timestamp = now();
        let echoed = PushSubscription {
            id: subscription.id,
            user_id: subscription.user_id,
            provider: subscription.provider,
            endpoint: subscription.endpoint,
            p256dh: subscription.p256dh,
            auth: subscription.auth,
            created_at: timestamp,
            updated_at: timestamp,
        };

        let mut subscriptions = self.subscriptions.lock().unwrap();
        match subscriptions.iter_mut().find(|stored| stored.endpoint == echoed.endpoint) {
            // The stored row keeps its id and createdAt.
            Some(stored) => {
                stored.provider = echoed.provider;
                stored.p256dh = echoed.p256dh.clone();
                stored.auth = echoed.auth.clone();
                stored.user_id = echoed.user_id.clone();
                stored.updated_at = timestamp;
            }
            None => subscriptions.push(echoed.clone()),
        }
        Ok(echoed)
    }

    async fn delete_by_endpoint(&self, endpoint: &str) -> DomainResult<()> {
        self.subscriptions.lock().unwrap().retain(|subscription| subscription.endpoint != endpoint);
        Ok(())
    }

    async fn delete_by_user_id(&self, user_id: &str) -> DomainResult<()> {
        self.subscriptions.lock().unwrap().retain(|subscription| subscription.user_id != user_id);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::push_subscription::PushSubscriptionProvider;

    #[tokio::test]
    async fn an_upsert_on_a_stored_endpoint_repoints_the_row_and_keeps_its_id() {
        let subscriptions = FakePushSubscriptionRepository::default();
        let data = |id: &str, user_id: &str| UpsertPushSubscriptionData {
            id: id.to_string(),
            user_id: user_id.to_string(),
            provider: PushSubscriptionProvider::Web,
            endpoint: "https://push.example/abc".to_string(),
            p256dh: Some("key".to_string()),
            auth: Some("auth".to_string()),
        };
        subscriptions.upsert(data("sub-1", "user-1")).await.unwrap();

        let echoed = subscriptions.upsert(data("sub-2", "user-2")).await.unwrap();

        assert_eq!(echoed.id, "sub-2");
        let stored = subscriptions.all();
        assert_eq!(stored.len(), 1);
        assert_eq!(stored[0].id, "sub-1");
        assert_eq!(stored[0].user_id, "user-2");
        assert!(subscriptions.find_by_user_id("user-1").await.unwrap().is_empty());
    }
}
