use std::sync::Arc;

use crate::domain::education::Education;
use crate::use_cases::client_date::ClientDate;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{EducationRepository, UpdateEducationData};

/// A partial update: `None` leaves the field alone, `Some(None)` clears a
/// nullable one.
#[derive(Default)]
pub struct UpdateEducationInput {
    pub id: String,
    pub user_id: String,
    pub institution: Option<String>,
    pub degree: Option<Option<String>>,
    pub field: Option<Option<String>>,
    pub start_date: Option<ClientDate>,
    pub end_date: Option<Option<ClientDate>>,
    pub description: Option<Option<String>>,
}

pub struct UpdateEducationUseCase {
    pub education_repository: Arc<dyn EducationRepository>,
}

impl UpdateEducationUseCase {
    pub async fn execute(&self, input: UpdateEducationInput) -> DomainResult<Education> {
        let existing = self.education_repository.find_by_id(&input.id).await?;
        if existing.is_none_or(|existing| existing.user_id != input.user_id) {
            return Err(DomainError::not_found("Education not found"));
        }

        let end_date = match input.end_date {
            Some(end_date) => Some(end_date.map(ClientDate::stored).transpose()?),
            None => None,
        };
        self.education_repository
            .update(
                &input.id,
                UpdateEducationData {
                    institution: input.institution,
                    degree: input.degree,
                    field: input.field,
                    start_date: input.start_date.map(ClientDate::stored).transpose()?,
                    end_date,
                    description: input.description,
                },
            )
            .await
    }
}
