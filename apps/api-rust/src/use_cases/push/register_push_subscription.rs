use std::sync::Arc;

use crate::domain::push_subscription::PushSubscriptionProvider;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{PushSubscriptionRepository, UpsertPushSubscriptionData};

pub struct RegisterPushSubscriptionInput {
    pub user_id: String,
    pub endpoint: String,
    pub p256dh: String,
    pub auth: String,
}

pub struct RegisterPushSubscriptionUseCase {
    pub push_subscription_repository: Arc<dyn PushSubscriptionRepository>,
    pub generate_id: GenerateId,
}

impl RegisterPushSubscriptionUseCase {
    pub async fn execute(&self, input: RegisterPushSubscriptionInput) -> DomainResult<()> {
        self.push_subscription_repository
            .upsert(UpsertPushSubscriptionData {
                id: (self.generate_id)(),
                user_id: input.user_id,
                provider: PushSubscriptionProvider::Web,
                endpoint: input.endpoint,
                p256dh: Some(input.p256dh),
                auth: Some(input.auth),
            })
            .await?;
        Ok(())
    }
}
