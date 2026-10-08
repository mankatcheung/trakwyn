use async_graphql::{Context, Object, Result};

use super::support::{container, request};
use crate::http::errors::GraphQLResultExt;
use crate::use_cases::cookie_consent::RecordCookieConsentInput;

#[derive(Default)]
pub struct CookieConsentMutation;

#[Object]
impl CookieConsentMutation {
    // Deliberately unauthenticated: a cookie-consent decision is made before,
    // or without, an account existing, from the landing page or the
    // login/register screens. A best-effort audit trail: the client has
    // already stored the decision locally, which is what gates rendering.
    async fn record_cookie_consent(
        &self,
        ctx: &Context<'_>,
        analytics_accepted: bool,
    ) -> Result<Option<bool>> {
        let device = &request(ctx).device;
        container(ctx)
            .record_cookie_consent_use_case()
            .execute(RecordCookieConsentInput {
                analytics_accepted,
                ip_address: device.ip_address.clone(),
                user_agent: device.user_agent.clone(),
            })
            .await
            .gql()?;
        Ok(Some(true))
    }
}
