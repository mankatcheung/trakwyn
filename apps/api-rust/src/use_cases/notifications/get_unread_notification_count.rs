use std::sync::Arc;

use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::NotificationRepository;

pub struct GetUnreadNotificationCountUseCase {
    pub notification_repository: Arc<dyn NotificationRepository>,
}

impl GetUnreadNotificationCountUseCase {
    pub async fn execute(&self, user_id: &str) -> DomainResult<i64> {
        self.notification_repository.count_unread_for_user(user_id).await
    }
}
