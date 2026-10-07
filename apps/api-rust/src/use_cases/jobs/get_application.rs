use std::sync::Arc;

use crate::domain::application::Application;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::ApplicationRepository;

pub struct GetApplicationInput {
    pub user_id: String,
    pub application_id: String,
    /// Read past the soft-delete filter so a trashed application resolves
    /// instead of reporting as missing. Only the GraphQL `application(id)`
    /// query sets this: it backs the read-only Trash preview, where landing
    /// on a stale link should explain "this is in Trash" rather than 404.
    pub include_trashed: bool,
}

pub struct GetApplicationUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
}

impl GetApplicationUseCase {
    pub async fn execute(&self, input: GetApplicationInput) -> DomainResult<Application> {
        let application = if input.include_trashed {
            self.application_repository.find_by_id_including_trashed(&input.application_id).await?
        } else {
            self.application_repository.find_by_id(&input.application_id).await?
        };
        let application =
            application.ok_or_else(|| DomainError::not_found("Application not found"))?;
        if application.user_id != input.user_id {
            return Err(DomainError::forbidden("Forbidden"));
        }
        Ok(application)
    }
}
