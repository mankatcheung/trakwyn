use crate::http::container::Container;
use crate::use_cases::notifications::{
    CreateNotificationUseCase, GetNotificationsPageUseCase, GetUnreadNotificationCountUseCase,
    MarkNotificationsReadUseCase,
};

impl Container {
    pub fn create_notification_use_case(&self) -> CreateNotificationUseCase {
        CreateNotificationUseCase {
            notification_repository: self.notification_repository.clone(),
            generate_id: self.generate_id.clone(),
        }
    }

    pub fn get_notifications_page_use_case(&self) -> GetNotificationsPageUseCase {
        GetNotificationsPageUseCase {
            notification_repository: self.notification_repository.clone(),
        }
    }

    pub fn mark_notifications_read_use_case(&self) -> MarkNotificationsReadUseCase {
        MarkNotificationsReadUseCase {
            notification_repository: self.notification_repository.clone(),
        }
    }

    pub fn get_unread_notification_count_use_case(&self) -> GetUnreadNotificationCountUseCase {
        GetUnreadNotificationCountUseCase {
            notification_repository: self.notification_repository.clone(),
        }
    }
}
