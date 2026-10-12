use std::sync::Arc;

use crate::domain::push_subscription::PushSubscriptionProvider;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{PushSubscriptionRepository, UpsertPushSubscriptionData};

pub struct RegisterExpoPushTokenInput {
    pub user_id: String,
    pub token: String,
}

/// Mobile counterpart of `RegisterPushSubscriptionUseCase`: an Expo push token
/// has no VAPID key material, so it is stored as an `expo`-provider row with
/// the token itself as the endpoint (already unique per device/install,
/// satisfying the same uniqueness the web-push endpoint upsert relies on).
pub struct RegisterExpoPushTokenUseCase {
    pub push_subscription_repository: Arc<dyn PushSubscriptionRepository>,
    pub generate_id: GenerateId,
}

impl RegisterExpoPushTokenUseCase {
    pub async fn execute(&self, input: RegisterExpoPushTokenInput) -> DomainResult<()> {
        self.push_subscription_repository
            .upsert(UpsertPushSubscriptionData {
                id: (self.generate_id)(),
                user_id: input.user_id,
                provider: PushSubscriptionProvider::Expo,
                endpoint: input.token,
                p256dh: None,
                auth: None,
            })
            .await?;
        Ok(())
    }
}
