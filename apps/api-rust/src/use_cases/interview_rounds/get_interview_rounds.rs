use std::sync::Arc;

use crate::domain::interview_round::InterviewRound;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{ApplicationRepository, InterviewRoundRepository};

pub struct GetInterviewRoundsInput {
    pub user_id: String,
    pub application_id: String,
}

pub struct GetInterviewRoundsUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub interview_round_repository: Arc<dyn InterviewRoundRepository>,
}

impl GetInterviewRoundsUseCase {
    pub async fn execute(
        &self,
        input: GetInterviewRoundsInput,
    ) -> DomainResult<Vec<InterviewRound>> {
        let application = self
            .application_repository
            .find_by_id(&input.application_id)
            .await?
            .ok_or_else(|| DomainError::not_found("Application not found"))?;
        if application.user_id != input.user_id {
            return Err(DomainError::forbidden("Forbidden"));
        }

        self.interview_round_repository.find_all_by_application_id(&input.application_id).await
    }
}
