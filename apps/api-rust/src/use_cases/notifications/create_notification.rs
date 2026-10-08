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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::use_cases::test_support::{sequential_ids, FakeNotificationRepository};

    fn use_case(notifications: Arc<FakeNotificationRepository>) -> CreateNotificationUseCase {
        CreateNotificationUseCase {
            notification_repository: notifications,
            generate_id: sequential_ids("notification"),
        }
    }

    fn input(url: Option<&str>) -> CreateNotificationInput {
        CreateNotificationInput {
            user_id: "user-1".to_string(),
            notification_type: NotificationType::SecurityAlert,
            title: "New sign-in detected".to_string(),
            body: "Chrome on macOS signed in".to_string(),
            url: url.map(str::to_string),
        }
    }

    #[tokio::test]
    async fn generates_an_id_and_creates_the_notification() {
        let notifications = Arc::new(FakeNotificationRepository::default());

        let created = use_case(notifications.clone())
            .execute(input(Some("/settings/security")))
            .await
            .unwrap();

        assert_eq!(created.id, "notification-1");
        assert_eq!(created.user_id, "user-1");
        assert_eq!(created.notification_type, NotificationType::SecurityAlert);
        assert_eq!(created.title, "New sign-in detected");
        assert_eq!(created.body, "Chrome on macOS signed in");
        assert_eq!(created.url.as_deref(), Some("/settings/security"));
        assert_eq!(created.read_at, None);
        assert_eq!(notifications.all(), vec![created]);
    }

    #[tokio::test]
    async fn passes_a_missing_url_through_as_none() {
        let notifications = Arc::new(FakeNotificationRepository::default());

        let created = use_case(notifications).execute(input(None)).await.unwrap();

        assert_eq!(created.url, None);
    }
}
