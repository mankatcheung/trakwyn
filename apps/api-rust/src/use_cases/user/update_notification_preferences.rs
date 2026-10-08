use std::sync::Arc;

use crate::domain::user::DigestFrequency;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{UpdateUserData, UserRepository};

const MIN_WEEKLY_APPLICATION_GOAL: i32 = 1;
const MAX_WEEKLY_APPLICATION_GOAL: i32 = 100;

/// A `None` field leaves that preference as it is.
///
/// `apps/api` also rejects a digest frequency outside daily/weekly/off
/// ("Invalid digest frequency"); here the type admits no other value.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct UpdateNotificationPreferencesInput {
    pub user_id: String,
    pub weekly_digest_enabled: Option<bool>,
    pub digest_frequency: Option<DigestFrequency>,
    pub follow_up_reminders_enabled: Option<bool>,
    pub push_notifications_enabled: Option<bool>,
    pub weekly_application_goal: Option<i32>,
}

pub struct UpdateNotificationPreferencesUseCase {
    pub user_repository: Arc<dyn UserRepository>,
}

impl UpdateNotificationPreferencesUseCase {
    pub async fn execute(&self, input: UpdateNotificationPreferencesInput) -> DomainResult<()> {
        self.user_repository
            .find_by_id(&input.user_id)
            .await?
            .ok_or_else(|| DomainError::not_found("User not found"))?;

        let goal_range = MIN_WEEKLY_APPLICATION_GOAL..=MAX_WEEKLY_APPLICATION_GOAL;
        if input.weekly_application_goal.is_some_and(|goal| !goal_range.contains(&goal)) {
            return Err(DomainError::validation(
                "Weekly application goal must be between 1 and 100",
            ));
        }

        // The frequency wins over the older on/off switch when both are sent:
        // "off" turns the digest off, any other frequency turns it on.
        let weekly_digest_enabled = match input.digest_frequency {
            Some(DigestFrequency::Off) => Some(false),
            Some(_) => Some(true),
            None => input.weekly_digest_enabled,
        };

        self.user_repository
            .update(
                &input.user_id,
                UpdateUserData {
                    weekly_digest_enabled,
                    digest_frequency: input.digest_frequency,
                    follow_up_reminders_enabled: input.follow_up_reminders_enabled,
                    push_notifications_enabled: input.push_notifications_enabled,
                    weekly_application_goal: input.weekly_application_goal,
                    ..UpdateUserData::default()
                },
            )
            .await?;
        Ok(())
    }
}
