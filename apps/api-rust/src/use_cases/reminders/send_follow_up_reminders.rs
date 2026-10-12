use std::sync::Arc;

use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{ApplicationRepository, EmailService, UserRepository};

/// What one run did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FollowUpRemindersSummary {
    /// Reminders emailed and marked as sent.
    pub sent: usize,
    /// Applications whose reminder failed; the run continued past each one.
    pub failed: usize,
    /// Due applications whose owner is gone or has reminders turned off.
    pub skipped: usize,
}

pub struct SendFollowUpRemindersUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub user_repository: Arc<dyn UserRepository>,
    pub email_service: Arc<dyn EmailService>,
}

impl SendFollowUpRemindersUseCase {
    pub async fn execute(&self) -> DomainResult<FollowUpRemindersSummary> {
        let applications = self.application_repository.find_due_for_reminder().await?;
        let mut summary = FollowUpRemindersSummary { sent: 0, failed: 0, skipped: 0 };

        for app in applications {
            let user = self.user_repository.find_by_id(&app.user_id).await?;
            let Some(user) = user.filter(|user| user.follow_up_reminders_enabled) else {
                summary.skipped += 1;
                continue;
            };

            // One failure must not block the rest; it is counted so the
            // route's summary line reports a partial run as partial.
            let Some(follow_up_at) = app.follow_up_at else {
                summary.failed += 1;
                continue;
            };
            let sent = async {
                self.email_service
                    .send_follow_up_reminder(&user.email, &app.company, &app.role, follow_up_at)
                    .await?;
                self.application_repository.update_reminder_sent_at(&app.id, now()).await
            }
            .await;
            match sent {
                Ok(()) => summary.sent += 1,
                Err(_) => summary.failed += 1,
            }
        }

        Ok(summary)
    }
}
