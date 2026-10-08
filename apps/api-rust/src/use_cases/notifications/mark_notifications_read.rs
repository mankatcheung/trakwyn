use std::sync::Arc;

use super::bulk_validation::assert_valid_bulk_notification_ids;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::NotificationRepository;

pub struct MarkNotificationsReadInput {
    pub user_id: String,
    pub ids: Vec<String>,
    pub is_read: bool,
}

pub struct MarkNotificationsReadUseCase {
    pub notification_repository: Arc<dyn NotificationRepository>,
}

impl MarkNotificationsReadUseCase {
    /// Ids that are not the user's are ignored, not refused.
    pub async fn execute(&self, input: MarkNotificationsReadInput) -> DomainResult<()> {
        assert_valid_bulk_notification_ids(&input.ids)?;
        self.notification_repository
            .mark_many_read_for_user(&input.user_id, &input.ids, input.is_read)
            .await?;
        Ok(())
    }
}
