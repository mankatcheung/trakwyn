use async_trait::async_trait;

use crate::domain::skill::Skill;
use crate::use_cases::errors::DomainResult;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateSkillData {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub category: Option<String>,
    pub proficiency: Option<String>,
}

/// A partial update: `None` leaves the column alone, `Some(None)` clears a
/// nullable one.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct UpdateSkillData {
    pub name: Option<String>,
    pub category: Option<Option<String>>,
    pub proficiency: Option<Option<String>>,
}

impl UpdateSkillData {
    pub fn is_empty(&self) -> bool {
        self.name.is_none() && self.category.is_none() && self.proficiency.is_none()
    }
}

#[async_trait]
pub trait SkillRepository: Send + Sync {
    /// Newest first, ties broken by id descending.
    async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<Skill>>;
    async fn find_by_id(&self, id: &str) -> DomainResult<Option<Skill>>;
    async fn create(&self, data: CreateSkillData) -> DomainResult<Skill>;
    /// An update that sets nothing is an internal error, as it is in
    /// `apps/api` (a `Skill` has no `updatedAt` to touch).
    async fn update(&self, id: &str, data: UpdateSkillData) -> DomainResult<Skill>;
    /// `user_id` is the owner, passed so a caching decorator can invalidate
    /// that user's list without a lookup.
    async fn delete(&self, id: &str, user_id: &str) -> DomainResult<()>;
}
