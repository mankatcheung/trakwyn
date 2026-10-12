use std::cmp::Reverse;
use std::sync::Mutex;

use async_trait::async_trait;

use crate::domain::skill::Skill;
use crate::use_cases::clock::now;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{CreateSkillData, SkillRepository, UpdateSkillData};

#[derive(Default)]
pub struct FakeSkillRepository {
    skills: Mutex<Vec<Skill>>,
}

impl FakeSkillRepository {
    pub fn with(skills: Vec<Skill>) -> Self {
        Self { skills: Mutex::new(skills) }
    }

    pub fn all(&self) -> Vec<Skill> {
        self.skills.lock().unwrap().clone()
    }
}

#[async_trait]
impl SkillRepository for FakeSkillRepository {
    async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<Skill>> {
        let mut skills: Vec<Skill> =
            self.all().into_iter().filter(|skill| skill.user_id == user_id).collect();
        skills.sort_by_key(|skill| Reverse((skill.created_at, skill.id.clone())));
        Ok(skills)
    }

    async fn find_by_id(&self, id: &str) -> DomainResult<Option<Skill>> {
        Ok(self.all().into_iter().find(|skill| skill.id == id))
    }

    async fn create(&self, data: CreateSkillData) -> DomainResult<Skill> {
        let skill = Skill {
            id: data.id,
            user_id: data.user_id,
            name: data.name,
            category: data.category,
            proficiency: data.proficiency,
            created_at: now(),
        };
        self.skills.lock().unwrap().push(skill.clone());
        Ok(skill)
    }

    async fn update(&self, id: &str, data: UpdateSkillData) -> DomainResult<Skill> {
        if data.is_empty() {
            return Err(DomainError::internal("No values to set"));
        }
        let mut skills = self.skills.lock().unwrap();
        let skill = skills
            .iter_mut()
            .find(|skill| skill.id == id)
            .ok_or_else(|| DomainError::not_found("Skill"))?;
        if let Some(name) = data.name {
            skill.name = name;
        }
        if let Some(category) = data.category {
            skill.category = category;
        }
        if let Some(proficiency) = data.proficiency {
            skill.proficiency = proficiency;
        }
        Ok(skill.clone())
    }

    async fn delete(&self, id: &str, _user_id: &str) -> DomainResult<()> {
        self.skills.lock().unwrap().retain(|skill| skill.id != id);
        Ok(())
    }
}
