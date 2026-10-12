//! Caches the notification bell's unread count, and only that, as `apps/api`'s
//! `CachedNotificationRepository` does. `find_page_by_user_id` is
//! cursor-paginated (too varied to key) and passes straight through.

use std::sync::Arc;

use async_trait::async_trait;

use crate::domain::notification::Notification;
use crate::infrastructure::cache::cache_keys::notification_unread_count;
use crate::infrastructure::cache::{Cache, CacheExt};
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{
    CreateNotificationData, FindNotificationsPagePagination, NotificationRepository,
    NotificationsPage,
};

pub struct CachedNotificationRepository {
    inner: Arc<dyn NotificationRepository>,
    cache: Arc<dyn Cache>,
}

impl CachedNotificationRepository {
    pub fn new(inner: Arc<dyn NotificationRepository>, cache: Arc<dyn Cache>) -> Self {
        Self { inner, cache }
    }
}

#[async_trait]
impl NotificationRepository for CachedNotificationRepository {
    async fn create(&self, data: CreateNotificationData) -> DomainResult<Notification> {
        let user_id = data.user_id.clone();
        let result = self.inner.create(data).await?;
        self.cache.delete(&notification_unread_count(&user_id)).await;
        Ok(result)
    }

    async fn find_page_by_user_id(
        &self,
        user_id: &str,
        pagination: FindNotificationsPagePagination,
    ) -> DomainResult<NotificationsPage> {
        self.inner.find_page_by_user_id(user_id, pagination).await
    }

    async fn mark_many_read_for_user(
        &self,
        user_id: &str,
        ids: &[String],
        is_read: bool,
    ) -> DomainResult<i64> {
        let result = self.inner.mark_many_read_for_user(user_id, ids, is_read).await?;
        self.cache.delete(&notification_unread_count(user_id)).await;
        Ok(result)
    }

    async fn count_unread_for_user(&self, user_id: &str) -> DomainResult<i64> {
        self.cache
            .get_or_set(
                &notification_unread_count(user_id),
                || self.inner.count_unread_for_user(user_id),
                None,
            )
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::notification::NotificationType;
    use crate::infrastructure::cache::MemoryCache;
    use crate::use_cases::test_support::FakeNotificationRepository;

    fn data(id: &str, user_id: &str) -> CreateNotificationData {
        CreateNotificationData {
            id: id.to_string(),
            user_id: user_id.to_string(),
            notification_type: NotificationType::FollowUpReminder,
            title: "title".to_string(),
            body: "body".to_string(),
            url: None,
        }
    }

    fn repository() -> (Arc<FakeNotificationRepository>, CachedNotificationRepository) {
        let inner = Arc::new(FakeNotificationRepository::default());
        let cached =
            CachedNotificationRepository::new(inner.clone(), Arc::new(MemoryCache::default()));
        (inner, cached)
    }

    #[tokio::test]
    async fn serves_a_repeated_count_from_the_cache() {
        let (inner, cached) = repository();
        assert_eq!(cached.count_unread_for_user("u1").await.unwrap(), 0);

        inner.create(data("n1", "u1")).await.unwrap();

        assert_eq!(cached.count_unread_for_user("u1").await.unwrap(), 0);
    }

    #[tokio::test]
    async fn keeps_one_count_per_user() {
        let (inner, cached) = repository();
        cached.count_unread_for_user("u1").await.unwrap();
        inner.create(data("n1", "u2")).await.unwrap();

        assert_eq!(cached.count_unread_for_user("u2").await.unwrap(), 1);
    }

    #[tokio::test]
    async fn create_invalidates_that_users_count_only() {
        let (inner, cached) = repository();
        cached.count_unread_for_user("u1").await.unwrap();
        cached.count_unread_for_user("u2").await.unwrap();
        inner.create(data("n0", "u2")).await.unwrap();

        cached.create(data("n1", "u1")).await.unwrap();

        assert_eq!(cached.count_unread_for_user("u1").await.unwrap(), 1);
        assert_eq!(cached.count_unread_for_user("u2").await.unwrap(), 0);
    }

    #[tokio::test]
    async fn marking_read_invalidates_the_count() {
        let (_, cached) = repository();
        cached.create(data("n1", "u1")).await.unwrap();
        assert_eq!(cached.count_unread_for_user("u1").await.unwrap(), 1);

        let marked = cached.mark_many_read_for_user("u1", &["n1".to_string()], true).await.unwrap();

        assert_eq!(marked, 1);
        assert_eq!(cached.count_unread_for_user("u1").await.unwrap(), 0);
    }

    #[tokio::test]
    async fn pages_are_never_cached() {
        let (inner, cached) = repository();
        let page = || FindNotificationsPagePagination { cursor: None, limit: 10 };
        assert!(cached.find_page_by_user_id("u1", page()).await.unwrap().items.is_empty());

        inner.create(data("n1", "u1")).await.unwrap();

        assert_eq!(cached.find_page_by_user_id("u1", page()).await.unwrap().items.len(), 1);
    }
}
