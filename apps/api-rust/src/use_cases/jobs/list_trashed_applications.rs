use std::sync::Arc;

use crate::domain::application::Application;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::ApplicationRepository;

/// What is in this user's Trash, most recently deleted first.
pub struct ListTrashedApplicationsUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
}

impl ListTrashedApplicationsUseCase {
    pub async fn execute(&self, user_id: &str) -> DomainResult<Vec<Application>> {
        self.application_repository.find_trashed_by_user_id(user_id).await
    }
}
