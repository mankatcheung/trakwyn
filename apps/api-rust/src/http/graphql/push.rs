use async_graphql::{Context, Object, Result};

use super::support::{container, require_user};
use crate::http::errors::GraphQLResultExt;
use crate::use_cases::push::{
    RegisterExpoPushTokenInput, RegisterPushSubscriptionInput, UnregisterPushSubscriptionInput,
};

#[derive(Default)]
pub struct PushMutation;

#[Object]
impl PushMutation {
    async fn register_push_subscription(
        &self,
        ctx: &Context<'_>,
        endpoint: String,
        #[graphql(name = "p256dh")] p256dh: String,
        auth: String,
    ) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        container(ctx)
            .register_push_subscription_use_case()
            .execute(RegisterPushSubscriptionInput {
                user_id: user.sub.clone(),
                endpoint,
                p256dh,
                auth,
            })
            .await
            .gql()?;
        Ok(Some(true))
    }

    async fn register_expo_push_token(
        &self,
        ctx: &Context<'_>,
        token: String,
    ) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        container(ctx)
            .register_expo_push_token_use_case()
            .execute(RegisterExpoPushTokenInput { user_id: user.sub.clone(), token })
            .await
            .gql()?;
        Ok(Some(true))
    }

    // Mobile reuses this mutation to unregister an Expo push token: it
    // deletes by endpoint regardless of provider, and an Expo token is
    // stored as the endpoint.
    async fn unregister_push_subscription(
        &self,
        ctx: &Context<'_>,
        endpoint: String,
    ) -> Result<Option<bool>> {
        require_user(ctx)?;
        container(ctx)
            .unregister_push_subscription_use_case()
            .execute(UnregisterPushSubscriptionInput { endpoint })
            .await
            .gql()?;
        Ok(Some(true))
    }
}
