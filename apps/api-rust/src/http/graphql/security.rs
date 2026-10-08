//! The read-only audit views: login history and the merged security feed.

use async_graphql::{Context, Object, Result, SimpleObject};

use super::support::{container, iso, require_user};
use crate::domain::login_event::LoginEvent;
use crate::http::errors::GraphQLResultExt;
use crate::use_cases::security_events::SecurityActivityItem;

#[derive(SimpleObject)]
#[graphql(name = "LoginEvent")]
pub struct LoginEventObject {
    id: Option<String>,
    ip_address: Option<String>,
    user_agent: Option<String>,
    created_at: Option<String>,
}

impl From<LoginEvent> for LoginEventObject {
    fn from(event: LoginEvent) -> Self {
        Self {
            id: Some(event.id),
            ip_address: event.ip_address,
            user_agent: event.user_agent,
            created_at: Some(iso(event.created_at)),
        }
    }
}

#[derive(SimpleObject)]
#[graphql(name = "SecurityActivityItem")]
pub struct SecurityActivityItemObject {
    id: Option<String>,
    event_type: Option<String>,
    ip_address: Option<String>,
    user_agent: Option<String>,
    created_at: Option<String>,
}

impl From<SecurityActivityItem> for SecurityActivityItemObject {
    fn from(item: SecurityActivityItem) -> Self {
        Self {
            id: Some(item.id),
            event_type: Some(item.event_type.as_str().to_string()),
            ip_address: item.ip_address,
            user_agent: item.user_agent,
            created_at: Some(iso(item.created_at)),
        }
    }
}

#[derive(Default)]
pub struct SecurityQuery;

#[Object]
impl SecurityQuery {
    async fn login_history(&self, ctx: &Context<'_>) -> Result<Option<Vec<LoginEventObject>>> {
        let user = require_user(ctx)?;
        let events = container(ctx).get_login_history_use_case().execute(&user.sub).await.gql()?;
        Ok(Some(events.into_iter().map(LoginEventObject::from).collect()))
    }

    async fn security_activity(
        &self,
        ctx: &Context<'_>,
    ) -> Result<Option<Vec<SecurityActivityItemObject>>> {
        let user = require_user(ctx)?;
        let items =
            container(ctx).get_security_activity_use_case().execute(&user.sub).await.gql()?;
        Ok(Some(items.into_iter().map(SecurityActivityItemObject::from).collect()))
    }
}
