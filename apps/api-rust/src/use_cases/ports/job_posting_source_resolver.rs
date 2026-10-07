use async_trait::async_trait;

use crate::use_cases::errors::DomainResult;

/// Where a job posting comes from: pasted text, or a link to fetch. Text
/// wins when both are given.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct JobPostingSource {
    pub text: Option<String>,
    pub url: Option<String>,
}

/// Turns a [`JobPostingSource`] into the posting's plain text.
#[async_trait]
pub trait JobPostingSourceResolver: Send + Sync {
    async fn resolve(&self, source: JobPostingSource) -> DomainResult<String>;
}
