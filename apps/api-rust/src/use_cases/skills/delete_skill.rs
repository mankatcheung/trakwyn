use std::sync::Arc;

use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::SkillRepository;

pub struct DeleteSkillInput {
    pub id: String,
    pub user_id: String,
}

pub struct DeleteSkillUseCase {
    pub skill_repository: Arc<dyn SkillRepository>,
}

impl DeleteSkillUseCase {
    pub async fn execute(&self, input: DeleteSkillInput) -> DomainResult<()> {
        let existing = self
            .skill_repository
            .find_by_id(&input.id)
            .await?
            .filter(|existing| existing.user_id == input.user_id)
            .ok_or_else(|| DomainError::not_found("Skill not found"))?;
        self.skill_repository.delete(&input.id, &existing.user_id).await
    }
}
