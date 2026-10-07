use std::sync::Arc;

use chrono::{DateTime, Utc};
use serde_json::json;

use crate::domain::activity_log::ActivityEventType;
use crate::domain::interview_round::{InterviewRound, InterviewRoundOutcome, InterviewRoundType};
use crate::use_cases::constants::{defaults, interview_round_defaults};
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{
    ActivityLogRepository, AppendActivityLogData, ApplicationRepository, CreateInterviewRoundData,
    InterviewRoundRepository,
};

#[derive(Debug, Clone, Default)]
pub struct CreateInterviewRoundInput {
    pub user_id: String,
    pub application_id: String,
    pub r#type: Option<InterviewRoundType>,
    pub scheduled_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub interviewer_name: Option<String>,
    pub notes: Option<String>,
    pub outcome: Option<InterviewRoundOutcome>,
}

pub struct CreateInterviewRoundUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub interview_round_repository: Arc<dyn InterviewRoundRepository>,
    /// Optional, as in the original: without one, no activity is logged.
    pub activity_log_repository: Option<Arc<dyn ActivityLogRepository>>,
    pub generate_id: GenerateId,
}

impl CreateInterviewRoundUseCase {
    pub async fn execute(&self, input: CreateInterviewRoundInput) -> DomainResult<InterviewRound> {
        let application = self
            .application_repository
            .find_by_id(&input.application_id)
            .await?
            .ok_or_else(|| DomainError::not_found("Application not found"))?;
        if application.user_id != input.user_id {
            return Err(DomainError::forbidden("Forbidden"));
        }

        let round = self
            .interview_round_repository
            .create(CreateInterviewRoundData {
                id: (self.generate_id)(),
                application_id: input.application_id.clone(),
                r#type: input.r#type.unwrap_or(interview_round_defaults::TYPE),
                scheduled_at: input.scheduled_at,
                completed_at: input.completed_at,
                interviewer_name: input.interviewer_name,
                notes: input.notes,
                outcome: Some(input.outcome.unwrap_or(defaults::INTERVIEW_OUTCOME)),
            })
            .await?;

        if let Some(activity_log_repository) = &self.activity_log_repository {
            // The payload's keys print as `roundId` then `type`, the order the
            // original writes them (serde_json sorts, and that is the order).
            let payload = json!({ "roundId": round.id, "type": round.r#type.as_str() });
            activity_log_repository
                .append(AppendActivityLogData {
                    id: (self.generate_id)(),
                    application_id: input.application_id,
                    actor_id: input.user_id,
                    event_type: ActivityEventType::InterviewAdded,
                    payload: payload.to_string(),
                })
                .await?;
        }

        Ok(round)
    }
}
