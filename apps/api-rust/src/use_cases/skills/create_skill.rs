use std::sync::Arc;

use crate::domain::skill::Skill;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{CreateSkillData, SkillRepository};

pub struct CreateSkillInput {
    pub user_id: String,
    pub name: String,
    pub category: Option<String>,
    pub proficiency: Option<String>,
}

pub struct CreateSkillUseCase {
    pub skill_repository: Arc<dyn SkillRepository>,
    pub generate_id: GenerateId,
}

impl CreateSkillUseCase {
    pub async fn execute(&self, input: CreateSkillInput) -> DomainResult<Skill> {
        self.skill_repository
            .create(CreateSkillData {
                id: (self.generate_id)(),
                user_id: input.user_id,
                name: input.name,
                category: input.category,
                proficiency: input.proficiency,
            })
            .await
    }
}
