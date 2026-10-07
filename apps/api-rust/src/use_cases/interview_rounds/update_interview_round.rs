use std::sync::Arc;

use chrono::{DateTime, Utc};

use crate::domain::interview_round::{InterviewRound, InterviewRoundOutcome, InterviewRoundType};
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{
    ApplicationRepository, InterviewRoundRepository, UpdateInterviewRoundData,
};

/// A field left `None` is not written; `Some(None)` clears a nullable one.
#[derive(Debug, Clone, Default)]
pub struct UpdateInterviewRoundInput {
    pub user_id: String,
    pub round_id: String,
    pub r#type: Option<InterviewRoundType>,
    pub scheduled_at: Option<Option<DateTime<Utc>>>,
    pub completed_at: Option<Option<DateTime<Utc>>>,
    pub interviewer_name: Option<Option<String>>,
    pub notes: Option<Option<String>>,
    pub outcome: Option<InterviewRoundOutcome>,
}

pub struct UpdateInterviewRoundUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub interview_round_repository: Arc<dyn InterviewRoundRepository>,
}

impl UpdateInterviewRoundUseCase {
    pub async fn execute(&self, input: UpdateInterviewRoundInput) -> DomainResult<InterviewRound> {
        let round = self
            .interview_round_repository
            .find_by_id(&input.round_id)
            .await?
            .ok_or_else(|| DomainError::not_found("Interview round not found"))?;

        // A round whose application is missing (or in Trash) is refused the
        // same way as someone else's, so the response does not say which.
        let application = self.application_repository.find_by_id(&round.application_id).await?;
        if application.is_none_or(|application| application.user_id != input.user_id) {
            return Err(DomainError::forbidden("Forbidden"));
        }

        self.interview_round_repository
            .update(
                &input.round_id,
                UpdateInterviewRoundData {
                    r#type: input.r#type,
                    scheduled_at: input.scheduled_at,
                    completed_at: input.completed_at,
                    interviewer_name: input.interviewer_name,
                    notes: input.notes,
                    outcome: input.outcome,
                },
            )
            .await
    }
}
