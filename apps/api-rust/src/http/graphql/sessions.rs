use async_graphql::{Context, Object, Result, SimpleObject, ID};

use super::auth_flows::unauthorized_error;
use super::support::{container, iso, request, require_user};
use crate::domain::session::Session;
use crate::http::errors::GraphQLResultExt;
use crate::use_cases::sessions::{RevokeOtherSessionsInput, RevokeSessionInput};

#[derive(SimpleObject)]
#[graphql(name = "Session")]
pub struct SessionObject {
    id: Option<ID>,
    user_agent: Option<String>,
    ip_address: Option<String>,
    device_label: Option<String>,
    location: Option<String>,
    last_used_at: Option<String>,
    created_at: Option<String>,
    current: Option<bool>,
}

impl SessionObject {
    fn new(session: Session, current_session_id: Option<&str>) -> Self {
        Self {
            current: Some(current_session_id == Some(session.id.as_str())),
            id: Some(ID(session.id)),
            user_agent: session.user_agent,
            ip_address: session.ip_address,
            device_label: session.device_label,
            location: session.location,
            last_used_at: Some(iso(session.last_used_at)),
            created_at: Some(iso(session.created_at)),
        }
    }
}

#[derive(Default)]
pub struct SessionsQuery;

#[Object]
impl SessionsQuery {
    async fn sessions(&self, ctx: &Context<'_>) -> Result<Option<Vec<SessionObject>>> {
        let user = require_user(ctx)?;
        let sessions = container(ctx).list_sessions_use_case().execute(&user.sub).await.gql()?;
        Ok(Some(
            sessions
                .into_iter()
                .map(|session| SessionObject::new(session, user.sid.as_deref()))
                .collect(),
        ))
    }
}

#[derive(Default)]
pub struct SessionsMutation;

#[Object]
impl SessionsMutation {
    async fn revoke_session(&self, ctx: &Context<'_>, id: ID) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        let device = &request(ctx).device;
        container(ctx)
            .revoke_session_use_case()
            .execute(RevokeSessionInput {
                session_id: id.0,
                user_id: user.sub.clone(),
                ip_address: device.ip_address.clone(),
                user_agent: device.user_agent.clone(),
            })
            .await
            .gql()?;
        Ok(Some(true))
    }

    async fn revoke_other_sessions(&self, ctx: &Context<'_>) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        let current_session_id = user
            .sid
            .clone()
            .filter(|sid| !sid.is_empty())
            .ok_or_else(|| unauthorized_error("No active session"))?;
        let device = &request(ctx).device;
        container(ctx)
            .revoke_other_sessions_use_case()
            .execute(RevokeOtherSessionsInput {
                user_id: user.sub.clone(),
                current_session_id,
                ip_address: device.ip_address.clone(),
                user_agent: device.user_agent.clone(),
            })
            .await
            .gql()?;
        Ok(Some(true))
    }
}
