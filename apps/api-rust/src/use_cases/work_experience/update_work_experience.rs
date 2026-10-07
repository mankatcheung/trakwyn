use std::sync::Arc;

use crate::domain::work_experience::WorkExperience;
use crate::use_cases::client_date::ClientDate;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{UpdateWorkExperienceData, WorkExperienceRepository};

/// A partial update: `None` leaves the field alone, `Some(None)` clears a
/// nullable one.
#[derive(Default)]
pub struct UpdateWorkExperienceInput {
    pub id: String,
    pub user_id: String,
    pub company: Option<String>,
    pub title: Option<String>,
    pub location: Option<Option<String>>,
    pub start_date: Option<ClientDate>,
    pub end_date: Option<Option<ClientDate>>,
    pub description: Option<Option<String>>,
}

pub struct UpdateWorkExperienceUseCase {
    pub work_experience_repository: Arc<dyn WorkExperienceRepository>,
}

impl UpdateWorkExperienceUseCase {
    pub async fn execute(&self, input: UpdateWorkExperienceInput) -> DomainResult<WorkExperience> {
        let existing = self.work_experience_repository.find_by_id(&input.id).await?;
        if existing.is_none_or(|existing| existing.user_id != input.user_id) {
            return Err(DomainError::not_found("Work experience not found"));
        }

        let end_date = match input.end_date {
            Some(end_date) => Some(end_date.map(ClientDate::stored).transpose()?),
            None => None,
        };
        self.work_experience_repository
            .update(
                &input.id,
                UpdateWorkExperienceData {
                    company: input.company,
                    title: input.title,
                    location: input.location,
                    start_date: input.start_date.map(ClientDate::stored).transpose()?,
                    end_date,
                    description: input.description,
                },
            )
            .await
    }
}
