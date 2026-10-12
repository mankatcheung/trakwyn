use std::sync::Arc;

use crate::domain::work_experience::WorkExperience;
use crate::use_cases::client_date::ClientDate;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{CreateWorkExperienceData, WorkExperienceRepository};

pub struct CreateWorkExperienceInput {
    pub user_id: String,
    pub company: String,
    pub title: String,
    pub location: Option<String>,
    pub start_date: ClientDate,
    pub end_date: Option<ClientDate>,
    pub description: Option<String>,
}

pub struct CreateWorkExperienceUseCase {
    pub work_experience_repository: Arc<dyn WorkExperienceRepository>,
    pub generate_id: GenerateId,
}

impl CreateWorkExperienceUseCase {
    pub async fn execute(&self, input: CreateWorkExperienceInput) -> DomainResult<WorkExperience> {
        self.work_experience_repository
            .create(CreateWorkExperienceData {
                id: (self.generate_id)(),
                user_id: input.user_id,
                company: input.company,
                title: input.title,
                location: input.location,
                start_date: input.start_date.stored()?,
                end_date: input.end_date.map(ClientDate::stored).transpose()?,
                description: input.description,
            })
            .await
    }
}
