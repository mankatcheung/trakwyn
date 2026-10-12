use std::cmp::Reverse;
use std::sync::Mutex;

use async_trait::async_trait;

use crate::domain::notification::Notification;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{
    CreateNotificationData, FindNotificationsPagePagination, NotificationRepository,
    NotificationsPage,
};

#[derive(Default)]
pub struct FakeNotificationRepository {
    notifications: Mutex<Vec<Notification>>,
}

impl FakeNotificationRepository {
    pub fn with(notifications: Vec<Notification>) -> Self {
        Self { notifications: Mutex::new(notifications) }
    }

    pub fn all(&self) -> Vec<Notification> {
        self.notifications.lock().unwrap().clone()
    }
}

#[async_trait]
impl NotificationRepository for FakeNotificationRepository {
    async fn create(&self, data: CreateNotificationData) -> DomainResult<Notification> {
        let notification = Notification {
            id: data.id,
            user_id: data.user_id,
            notification_type: data.notification_type,
            title: data.title,
            body: data.body,
            url: data.url,
            read_at: None,
            created_at: now(),
        };
        self.notifications.lock().unwrap().push(notification.clone());
        Ok(notification)
    }

    async fn find_page_by_user_id(
        &self,
        user_id: &str,
        pagination: FindNotificationsPagePagination,
    ) -> DomainResult<NotificationsPage> {
        let FindNotificationsPagePagination { cursor, limit } = pagination;
        let all = self.all();

        // Looked up by id alone, whoever owns it; an unknown cursor is ignored.
        let position = cursor
            .filter(|id| !id.is_empty())
            .and_then(|id| all.iter().find(|notification| notification.id == id))
            .map(|notification| (notification.created_at, notification.id.clone()));

        let mut items: Vec<Notification> = all
            .iter()
            .filter(|notification| notification.user_id == user_id)
            .filter(|notification| match &position {
                Some((created_at, id)) => {
                    notification.created_at < *created_at
                        || (notification.created_at == *created_at && notification.id < *id)
                }
                None => true,
            })
            .cloned()
            .collect();
        items.sort_by_key(|notification| {
            Reverse((notification.created_at, notification.id.clone()))
        });

        let has_next_page = items.len() as i64 > limit;
        items.truncate(limit.max(0) as usize);
        Ok(NotificationsPage { items, has_next_page })
    }

    async fn mark_many_read_for_user(
        &self,
        user_id: &str,
        ids: &[String],
        is_read: bool,
    ) -> DomainResult<i64> {
        let read_at = is_read.then(now);
        let mut changed = 0;
        for notification in self.notifications.lock().unwrap().iter_mut() {
            let targeted = notification.user_id == user_id && ids.contains(&notification.id);
            // Only rows not already in the target state count.
            if targeted && notification.read_at.is_some() != is_read {
                notification.read_at = read_at;
                changed += 1;
            }
        }
        Ok(changed)
    }

    async fn count_unread_for_user(&self, user_id: &str) -> DomainResult<i64> {
        let unread = self
            .all()
            .iter()
            .filter(|notification| {
                notification.user_id == user_id && notification.read_at.is_none()
            })
            .count();
        Ok(unread as i64)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::notification::NotificationType;

    fn notification(id: &str, user_id: &str) -> Notification {
        Notification {
            id: id.to_string(),
            user_id: user_id.to_string(),
            notification_type: NotificationType::InterviewReminder,
            title: "Interview tomorrow".to_string(),
            body: "Acme, 10:00".to_string(),
            url: None,
            read_at: None,
            // One shared instant, so the id tie-breaker carries the order.
            created_at: chrono::DateTime::UNIX_EPOCH,
        }
    }

    fn page(cursor: Option<&str>, limit: i64) -> FindNotificationsPagePagination {
        FindNotificationsPagePagination { cursor: cursor.map(str::to_string), limit }
    }

    fn ids(page: &NotificationsPage) -> Vec<&str> {
        page.items.iter().map(|notification| notification.id.as_str()).collect()
    }

    #[tokio::test]
    async fn pages_through_rows_sharing_a_timestamp_without_gaps_or_repeats() {
        let notifications = FakeNotificationRepository::with(
            ["n1", "n2", "n3", "n4", "n5"].map(|id| notification(id, "user-1")).to_vec(),
        );

        let first = notifications.find_page_by_user_id("user-1", page(None, 2)).await.unwrap();
        assert_eq!(ids(&first), vec!["n5", "n4"]);
        assert!(first.has_next_page);

        let second =
            notifications.find_page_by_user_id("user-1", page(Some("n4"), 2)).await.unwrap();
        assert_eq!(ids(&second), vec!["n3", "n2"]);
        assert!(second.has_next_page);

        let last = notifications.find_page_by_user_id("user-1", page(Some("n2"), 2)).await.unwrap();
        assert_eq!(ids(&last), vec!["n1"]);
        assert!(!last.has_next_page);
    }

    #[tokio::test]
    async fn an_unknown_or_empty_cursor_starts_from_the_newest() {
        let notifications = FakeNotificationRepository::with(vec![notification("n1", "user-1")]);

        for cursor in [Some("gone"), Some("")] {
            let found =
                notifications.find_page_by_user_id("user-1", page(cursor, 5)).await.unwrap();
            assert_eq!(ids(&found), vec!["n1"]);
        }
    }

    #[tokio::test]
    async fn marking_counts_only_the_users_rows_that_changed() {
        let notifications = FakeNotificationRepository::with(vec![
            notification("n1", "user-1"),
            notification("n2", "user-1"),
            notification("foreign", "user-2"),
        ]);
        let targets = ["n1", "n2", "foreign"].map(str::to_string);

        assert_eq!(
            notifications.mark_many_read_for_user("user-1", &targets[..1], true).await.unwrap(),
            1
        );
        // n1 is already read; only n2 changes, and the foreign row is untouched.
        assert_eq!(
            notifications.mark_many_read_for_user("user-1", &targets, true).await.unwrap(),
            1
        );
        assert_eq!(notifications.count_unread_for_user("user-1").await.unwrap(), 0);
        assert_eq!(notifications.count_unread_for_user("user-2").await.unwrap(), 1);

        assert_eq!(
            notifications.mark_many_read_for_user("user-1", &targets, false).await.unwrap(),
            2
        );
        assert_eq!(notifications.count_unread_for_user("user-1").await.unwrap(), 2);
    }
}
