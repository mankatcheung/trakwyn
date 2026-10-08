use std::sync::Arc;

use crate::domain::education::Education;
use crate::use_cases::client_date::ClientDate;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{CreateEducationData, EducationRepository};

pub struct CreateEducationInput {
    pub user_id: String,
    pub institution: String,
    pub degree: Option<String>,
    pub field: Option<String>,
    pub start_date: ClientDate,
    pub end_date: Option<ClientDate>,
    pub description: Option<String>,
}

pub struct CreateEducationUseCase {
    pub education_repository: Arc<dyn EducationRepository>,
    pub generate_id: GenerateId,
}

impl CreateEducationUseCase {
    pub async fn execute(&self, input: CreateEducationInput) -> DomainResult<Education> {
        self.education_repository
            .create(CreateEducationData {
                id: (self.generate_id)(),
                user_id: input.user_id,
                institution: input.institution,
                degree: input.degree,
                field: input.field,
                start_date: input.start_date.stored()?,
                end_date: input.end_date.map(ClientDate::stored).transpose()?,
                description: input.description,
            })
            .await
    }
}
