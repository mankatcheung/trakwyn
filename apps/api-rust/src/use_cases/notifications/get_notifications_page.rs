use std::sync::Arc;

use crate::domain::notification::Notification;
use crate::use_cases::constants::pagination;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{FindNotificationsPagePagination, NotificationRepository};

pub struct GetNotificationsPageInput {
    pub user_id: String,
    pub cursor: Option<String>,
    /// `None` uses the default page size; anything else is clamped to
    /// `1..=pagination::MAX_LIMIT`.
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GetNotificationsPageOutput {
    pub items: Vec<Notification>,
    /// The id of the last item, when another page follows.
    pub next_cursor: Option<String>,
    pub has_next_page: bool,
}

pub struct GetNotificationsPageUseCase {
    pub notification_repository: Arc<dyn NotificationRepository>,
}

impl GetNotificationsPageUseCase {
    pub async fn execute(
        &self,
        input: GetNotificationsPageInput,
    ) -> DomainResult<GetNotificationsPageOutput> {
        let limit =
            input.limit.unwrap_or(pagination::DEFAULT_LIMIT).min(pagination::MAX_LIMIT).max(1);

        let page = self
            .notification_repository
            .find_page_by_user_id(
                &input.user_id,
                FindNotificationsPagePagination { cursor: input.cursor, limit },
            )
            .await?;

        let next_cursor = if page.has_next_page {
            page.items.last().map(|notification| notification.id.clone())
        } else {
            None
        };
        Ok(GetNotificationsPageOutput {
            items: page.items,
            next_cursor,
            has_next_page: page.has_next_page,
        })
    }
}
