use async_trait::async_trait;
use chrono::{DateTime, Utc};

use crate::domain::company_briefing::CompanyBriefing;
use crate::use_cases::errors::DomainResult;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpsertCompanyBriefingData {
    pub id: String,
    pub application_id: String,
    pub content: String,
    pub generated_at: DateTime<Utc>,
}

#[async_trait]
pub trait CompanyBriefingRepository: Send + Sync {
    async fn find_by_application_id(
        &self,
        application_id: &str,
    ) -> DomainResult<Option<CompanyBriefing>>;
    /// One briefing per application: regenerating replaces the row rather than
    /// adding another. The unique constraint on `applicationId` is what makes
    /// that true, not the caller remembering to delete first.
    async fn upsert(&self, data: UpsertCompanyBriefingData) -> DomainResult<CompanyBriefing>;
}
