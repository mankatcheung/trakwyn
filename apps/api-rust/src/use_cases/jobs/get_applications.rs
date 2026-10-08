use std::sync::Arc;

use crate::domain::application::{Application, ApplicationStatus};
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{ApplicationRepository, FindApplicationsFilters};

pub struct GetApplicationsInput {
    pub user_id: String,
    pub status: Option<ApplicationStatus>,
}

pub struct GetApplicationsUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
}

impl GetApplicationsUseCase {
    pub async fn execute(&self, input: GetApplicationsInput) -> DomainResult<Vec<Application>> {
        self.application_repository
            .find_all_by_user_id(&input.user_id, FindApplicationsFilters { status: input.status })
            .await
    }
}
