use std::sync::Arc;

use crate::use_cases::clock::now;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::ApplicationRepository;

pub struct DeleteApplicationInput {
    pub user_id: String,
    pub application_id: String,
}

/// Moves an application to Trash. It stops being visible everywhere at once,
/// because the repository filters it out rather than each caller remembering
/// to.
///
/// Nothing is destroyed here. The documents keep their blobs and the child
/// tables keep their rows, which is what lets restore be a single UPDATE.
pub struct DeleteApplicationUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
}

impl DeleteApplicationUseCase {
    pub async fn execute(&self, input: DeleteApplicationInput) -> DomainResult<()> {
        let application = self
            .application_repository
            .find_by_id(&input.application_id)
            .await?
            .ok_or_else(|| DomainError::not_found("Application not found"))?;
        if application.user_id != input.user_id {
            return Err(DomainError::forbidden("Forbidden"));
        }

        self.application_repository.soft_delete(&input.application_id, now()).await
    }
}
