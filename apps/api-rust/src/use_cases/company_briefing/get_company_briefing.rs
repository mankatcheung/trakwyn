use std::sync::Arc;

use crate::domain::company_briefing::CompanyBriefing;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{ApplicationRepository, CompanyBriefingRepository};

pub struct GetCompanyBriefingInput {
    pub user_id: String,
    pub application_id: String,
}

/// Reads the stored briefing, or `None` when one has never been generated.
///
/// `None` is not an error: "no briefing yet" is the normal opening state of
/// the tab, and making the caller distinguish that from a real failure would
/// push the decision to every client.
pub struct GetCompanyBriefingUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub company_briefing_repository: Arc<dyn CompanyBriefingRepository>,
}

impl GetCompanyBriefingUseCase {
    pub async fn execute(
        &self,
        input: GetCompanyBriefingInput,
    ) -> DomainResult<Option<CompanyBriefing>> {
        // Goes through the trash-filtered `find_by_id`, so a trashed
        // application reports as missing rather than serving its briefing.
        let app = self
            .application_repository
            .find_by_id(&input.application_id)
            .await?
            .ok_or_else(|| DomainError::not_found("Application not found"))?;
        if app.user_id != input.user_id {
            return Err(DomainError::forbidden("Forbidden"));
        }

        self.company_briefing_repository.find_by_application_id(&input.application_id).await
    }
}
