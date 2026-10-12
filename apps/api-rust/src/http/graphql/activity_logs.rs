use async_graphql::{Context, Object, Result, SimpleObject, ID};

use super::support::{container, iso, require_user};
use crate::domain::activity_log::ActivityLog;
use crate::http::errors::GraphQLResultExt;
use crate::use_cases::activity_logs::GetActivityLogsInput;

// Every field is a `String` in the contract, the ids included.
#[derive(SimpleObject)]
#[graphql(name = "ActivityLog")]
pub struct ActivityLogObject {
    id: Option<String>,
    application_id: Option<String>,
    actor_id: Option<String>,
    event_type: Option<String>,
    payload: Option<String>,
    created_at: Option<String>,
}

impl From<ActivityLog> for ActivityLogObject {
    fn from(log: ActivityLog) -> Self {
        Self {
            id: Some(log.id),
            application_id: Some(log.application_id),
            actor_id: Some(log.actor_id),
            event_type: Some(log.event_type.as_str().to_string()),
            payload: Some(log.payload),
            created_at: Some(iso(log.created_at)),
        }
    }
}

#[derive(Default)]
pub struct ActivityLogsQuery;

#[Object]
impl ActivityLogsQuery {
    async fn activity_logs(
        &self,
        ctx: &Context<'_>,
        application_id: ID,
    ) -> Result<Option<Vec<ActivityLogObject>>> {
        let user = require_user(ctx)?;
        let logs = container(ctx)
            .get_activity_logs_use_case()
            .execute(GetActivityLogsInput {
                application_id: application_id.0,
                user_id: user.sub.clone(),
            })
            .await
            .gql()?;
        Ok(Some(logs.into_iter().map(ActivityLogObject::from).collect()))
    }
}
