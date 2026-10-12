use std::sync::Arc;

use crate::domain::notification::{Notification, NotificationType};
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{CreateNotificationData, NotificationRepository};

pub struct CreateNotificationInput {
    pub user_id: String,
    pub notification_type: NotificationType,
    pub title: String,
    pub body: String,
    pub url: Option<String>,
}

/// Writes one inbox row. Push delivery is not this use case's job: the
/// callers that also push do so themselves.
pub struct CreateNotificationUseCase {
    pub notification_repository: Arc<dyn NotificationRepository>,
    pub generate_id: GenerateId,
}

impl CreateNotificationUseCase {
    pub async fn execute(&self, input: CreateNotificationInput) -> DomainResult<Notification> {
        self.notification_repository
            .create(CreateNotificationData {
                id: (self.generate_id)(),
                user_id: input.user_id,
                notification_type: input.notification_type,
                title: input.title,
                body: input.body,
                url: input.url,
            })
            .await
    }
}
