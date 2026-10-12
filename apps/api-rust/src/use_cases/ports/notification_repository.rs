use async_trait::async_trait;

use crate::domain::notification::{Notification, NotificationType};
use crate::use_cases::errors::DomainResult;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateNotificationData {
    pub id: String,
    pub user_id: String,
    pub notification_type: NotificationType,
    pub title: String,
    pub body: String,
    pub url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FindNotificationsPagePagination {
    /// The id of the last notification of the previous page. `None`, an empty
    /// string or an id that no longer exists all start from the newest.
    pub cursor: Option<String>,
    pub limit: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NotificationsPage {
    pub items: Vec<Notification>,
    pub has_next_page: bool,
}

#[async_trait]
pub trait NotificationRepository: Send + Sync {
    async fn create(&self, data: CreateNotificationData) -> DomainResult<Notification>;
    /// Newest first, ties broken by id descending.
    async fn find_page_by_user_id(
        &self,
        user_id: &str,
        pagination: FindNotificationsPagePagination,
    ) -> DomainResult<NotificationsPage>;
    /// Marks the given notifications (scoped to `user_id`, ignoring ids that
    /// do not belong to them) read or unread. Returns the number of rows
    /// actually updated.
    async fn mark_many_read_for_user(
        &self,
        user_id: &str,
        ids: &[String],
        is_read: bool,
    ) -> DomainResult<i64>;
    async fn count_unread_for_user(&self, user_id: &str) -> DomainResult<i64>;
}
