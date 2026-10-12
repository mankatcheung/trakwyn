use std::sync::Arc;

use crate::domain::user::DigestFrequency;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::UserRepository;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NotificationPreferences {
    pub weekly_digest_enabled: bool,
    pub digest_frequency: DigestFrequency,
    pub follow_up_reminders_enabled: bool,
    pub push_notifications_enabled: bool,
    pub weekly_application_goal: i32,
}

pub struct GetNotificationPreferencesUseCase {
    pub user_repository: Arc<dyn UserRepository>,
}

impl GetNotificationPreferencesUseCase {
    pub async fn execute(&self, user_id: &str) -> DomainResult<NotificationPreferences> {
        let user = self
            .user_repository
            .find_by_id(user_id)
            .await?
            .ok_or_else(|| DomainError::not_found("User not found"))?;

        Ok(NotificationPreferences {
            weekly_digest_enabled: user.weekly_digest_enabled,
            digest_frequency: user.digest_frequency,
            follow_up_reminders_enabled: user.follow_up_reminders_enabled,
            push_notifications_enabled: user.push_notifications_enabled,
            weekly_application_goal: user.weekly_application_goal,
        })
    }
}
