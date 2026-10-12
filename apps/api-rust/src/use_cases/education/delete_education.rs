use std::sync::Arc;

use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::EducationRepository;

pub struct DeleteEducationInput {
    pub id: String,
    pub user_id: String,
}

pub struct DeleteEducationUseCase {
    pub education_repository: Arc<dyn EducationRepository>,
}

impl DeleteEducationUseCase {
    pub async fn execute(&self, input: DeleteEducationInput) -> DomainResult<()> {
        let existing = self
            .education_repository
            .find_by_id(&input.id)
            .await?
            .filter(|existing| existing.user_id == input.user_id)
            .ok_or_else(|| DomainError::not_found("Education not found"))?;
        self.education_repository.delete(&input.id, &existing.user_id).await
    }
}
