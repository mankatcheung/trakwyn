use std::sync::Arc;

use crate::domain::activity_log::ActivityLog;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{ActivityLogRepository, ApplicationRepository};

pub struct GetActivityLogsInput {
    pub application_id: String,
    pub user_id: String,
}

pub struct GetActivityLogsUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub activity_log_repository: Arc<dyn ActivityLogRepository>,
}

impl GetActivityLogsUseCase {
    pub async fn execute(&self, input: GetActivityLogsInput) -> DomainResult<Vec<ActivityLog>> {
        let application = self
            .application_repository
            .find_by_id(&input.application_id)
            .await?
            .ok_or_else(|| DomainError::not_found("Application not found"))?;
        if application.user_id != input.user_id {
            return Err(DomainError::forbidden("Forbidden"));
        }

        self.activity_log_repository.find_all_by_application_id(&input.application_id).await
    }
}
