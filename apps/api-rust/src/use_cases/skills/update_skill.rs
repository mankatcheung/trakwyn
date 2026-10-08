use std::sync::Arc;

use crate::domain::skill::Skill;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{SkillRepository, UpdateSkillData};

/// A partial update: `None` leaves the field alone, `Some(None)` clears a
/// nullable one.
#[derive(Default)]
pub struct UpdateSkillInput {
    pub id: String,
    pub user_id: String,
    pub name: Option<String>,
    pub category: Option<Option<String>>,
    pub proficiency: Option<Option<String>>,
}

pub struct UpdateSkillUseCase {
    pub skill_repository: Arc<dyn SkillRepository>,
}

impl UpdateSkillUseCase {
    pub async fn execute(&self, input: UpdateSkillInput) -> DomainResult<Skill> {
        let existing = self.skill_repository.find_by_id(&input.id).await?;
        if existing.is_none_or(|existing| existing.user_id != input.user_id) {
            return Err(DomainError::not_found("Skill not found"));
        }

        // An input that sets nothing is passed on as it is; the repository
        // refuses it, as `apps/api`'s does.
        self.skill_repository
            .update(
                &input.id,
                UpdateSkillData {
                    name: input.name,
                    category: input.category,
                    proficiency: input.proficiency,
                },
            )
            .await
    }
}
