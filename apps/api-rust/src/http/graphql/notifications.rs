use async_graphql::{Context, Object, Result, SimpleObject, ID};

use super::support::{container, iso, require_user};
use crate::domain::notification::Notification;
use crate::http::errors::GraphQLResultExt;
use crate::use_cases::notifications::{GetNotificationsPageInput, MarkNotificationsReadInput};

#[derive(SimpleObject)]
#[graphql(name = "Notification")]
pub struct NotificationObject {
    id: Option<ID>,
    #[graphql(name = "type")]
    notification_type: Option<String>,
    title: Option<String>,
    body: Option<String>,
    url: Option<String>,
    read: Option<bool>,
    created_at: Option<String>,
}

impl From<Notification> for NotificationObject {
    fn from(notification: Notification) -> Self {
        Self {
            id: Some(ID(notification.id)),
            notification_type: Some(notification.notification_type.as_str().to_string()),
            title: Some(notification.title),
            body: Some(notification.body),
            url: notification.url,
            read: Some(notification.read_at.is_some()),
            created_at: Some(iso(notification.created_at)),
        }
    }
}

#[derive(SimpleObject)]
#[graphql(name = "NotificationConnection")]
pub struct NotificationConnection {
    items: Option<Vec<NotificationObject>>,
    next_cursor: Option<String>,
    has_next_page: Option<bool>,
}

#[derive(Default)]
pub struct NotificationsQuery;

#[Object]
impl NotificationsQuery {
    async fn notifications_page(
        &self,
        ctx: &Context<'_>,
        cursor: Option<String>,
        limit: Option<i32>,
    ) -> Result<Option<NotificationConnection>> {
        let user = require_user(ctx)?;
        let page = container(ctx)
            .get_notifications_page_use_case()
            .execute(GetNotificationsPageInput {
                user_id: user.sub.clone(),
                cursor,
                limit: limit.map(i64::from),
            })
            .await
            .gql()?;
        Ok(Some(NotificationConnection {
            items: Some(page.items.into_iter().map(NotificationObject::from).collect()),
            next_cursor: page.next_cursor,
            has_next_page: Some(page.has_next_page),
        }))
    }

    async fn unread_notification_count(&self, ctx: &Context<'_>) -> Result<Option<i32>> {
        let user = require_user(ctx)?;
        let count = container(ctx)
            .get_unread_notification_count_use_case()
            .execute(&user.sub)
            .await
            .gql()?;
        Ok(Some(i32::try_from(count).unwrap_or(i32::MAX)))
    }
}

#[derive(Default)]
pub struct NotificationsMutation;

#[Object]
impl NotificationsMutation {
    async fn mark_notifications_read(
        &self,
        ctx: &Context<'_>,
        ids: Vec<ID>,
        is_read: bool,
    ) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        container(ctx)
            .mark_notifications_read_use_case()
            .execute(MarkNotificationsReadInput {
                user_id: user.sub.clone(),
                ids: ids.into_iter().map(|id| id.0).collect(),
                is_read,
            })
            .await
            .gql()?;
        Ok(Some(true))
    }
}
