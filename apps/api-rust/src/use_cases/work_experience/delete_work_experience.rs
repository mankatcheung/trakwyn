use std::sync::Arc;

use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::WorkExperienceRepository;

pub struct DeleteWorkExperienceInput {
    pub id: String,
    pub user_id: String,
}

pub struct DeleteWorkExperienceUseCase {
    pub work_experience_repository: Arc<dyn WorkExperienceRepository>,
}

impl DeleteWorkExperienceUseCase {
    pub async fn execute(&self, input: DeleteWorkExperienceInput) -> DomainResult<()> {
        let existing = self
            .work_experience_repository
            .find_by_id(&input.id)
            .await?
            .filter(|existing| existing.user_id == input.user_id)
            .ok_or_else(|| DomainError::not_found("Work experience not found"))?;
        self.work_experience_repository.delete(&input.id, &existing.user_id).await
    }
}
