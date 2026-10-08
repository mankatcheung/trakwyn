pub mod bulk_validation;
pub mod create_notification;
pub mod get_notifications_page;
pub mod get_unread_notification_count;
pub mod mark_notifications_read;

pub use create_notification::{CreateNotificationInput, CreateNotificationUseCase};
pub use get_notifications_page::*;
pub use get_unread_notification_count::GetUnreadNotificationCountUseCase;
pub use mark_notifications_read::{MarkNotificationsReadInput, MarkNotificationsReadUseCase};

#[cfg(test)]
mod tests;
