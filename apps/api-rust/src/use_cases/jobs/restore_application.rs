use std::sync::Arc;

use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::ApplicationRepository;

pub struct RestoreApplicationInput {
    pub user_id: String,
    pub application_id: String,
}

/// Brings an application back out of Trash.
///
/// Looks it up including trashed ones: `find_by_id` would report it missing,
/// which is the point of that filter everywhere else and exactly wrong here.
pub struct RestoreApplicationUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
}

impl RestoreApplicationUseCase {
    pub async fn execute(&self, input: RestoreApplicationInput) -> DomainResult<()> {
        let application = self
            .application_repository
            .find_by_id_including_trashed(&input.application_id)
            .await?
            .filter(|application| application.deleted_at.is_some())
            .ok_or_else(|| DomainError::not_found("Application not found in Trash"))?;
        if application.user_id != input.user_id {
            return Err(DomainError::forbidden("Forbidden"));
        }

        self.application_repository.restore(&input.application_id).await
    }
}
