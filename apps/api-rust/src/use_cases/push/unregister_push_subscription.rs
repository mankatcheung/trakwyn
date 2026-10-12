use std::sync::Arc;

use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::PushSubscriptionRepository;

pub struct UnregisterPushSubscriptionInput {
    pub endpoint: String,
}

/// Deletes by endpoint, whoever owns it and whichever provider it is for:
/// `apps/api` takes no user id here, so neither does this.
pub struct UnregisterPushSubscriptionUseCase {
    pub push_subscription_repository: Arc<dyn PushSubscriptionRepository>,
}

impl UnregisterPushSubscriptionUseCase {
    pub async fn execute(&self, input: UnregisterPushSubscriptionInput) -> DomainResult<()> {
        self.push_subscription_repository.delete_by_endpoint(&input.endpoint).await
    }
}
