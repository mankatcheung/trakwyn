use async_trait::async_trait;
use chrono::{DateTime, Utc};

use crate::domain::education::Education;
use crate::use_cases::errors::DomainResult;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateEducationData {
    pub id: String,
    pub user_id: String,
    pub institution: String,
    pub degree: Option<String>,
    pub field: Option<String>,
    pub start_date: DateTime<Utc>,
    pub end_date: Option<DateTime<Utc>>,
    pub description: Option<String>,
}

/// A partial update: `None` leaves the column alone, `Some(None)` clears a
/// nullable one.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct UpdateEducationData {
    pub institution: Option<String>,
    pub degree: Option<Option<String>>,
    pub field: Option<Option<String>>,
    pub start_date: Option<DateTime<Utc>>,
    pub end_date: Option<Option<DateTime<Utc>>>,
    pub description: Option<Option<String>>,
}

#[async_trait]
pub trait EducationRepository: Send + Sync {
    /// Latest start date first, ties broken by id descending.
    async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<Education>>;
    async fn find_by_id(&self, id: &str) -> DomainResult<Option<Education>>;
    async fn create(&self, data: CreateEducationData) -> DomainResult<Education>;
    async fn update(&self, id: &str, data: UpdateEducationData) -> DomainResult<Education>;
    /// `user_id` is the owner, passed so a caching decorator can invalidate
    /// that user's list without a lookup.
    async fn delete(&self, id: &str, user_id: &str) -> DomainResult<()>;
}
