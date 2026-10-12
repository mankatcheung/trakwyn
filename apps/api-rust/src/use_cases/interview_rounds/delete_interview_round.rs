use std::sync::Arc;

use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{ApplicationRepository, InterviewRoundRepository};

pub struct DeleteInterviewRoundInput {
    pub user_id: String,
    pub round_id: String,
}

pub struct DeleteInterviewRoundUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub interview_round_repository: Arc<dyn InterviewRoundRepository>,
}

impl DeleteInterviewRoundUseCase {
    pub async fn execute(&self, input: DeleteInterviewRoundInput) -> DomainResult<()> {
        let round = self
            .interview_round_repository
            .find_by_id(&input.round_id)
            .await?
            .ok_or_else(|| DomainError::not_found("Interview round not found"))?;

        let application = self.application_repository.find_by_id(&round.application_id).await?;
        if application.is_none_or(|application| application.user_id != input.user_id) {
            return Err(DomainError::forbidden("Forbidden"));
        }

        self.interview_round_repository.delete(&input.round_id, &round.application_id).await
    }
}
