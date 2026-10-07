use async_trait::async_trait;
use chrono::{DateTime, Utc};

use crate::domain::llm_usage_event::LlmUsageSummary;
use crate::use_cases::errors::DomainResult;

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct RecordLlmUsageEventData {
    pub id: String,
    pub user_id: String,
    pub provider: String,
    pub model: Option<String>,
    pub prompt_tokens: i32,
    pub completion_tokens: i32,
    /// `None` when the provider reported no split.
    pub cache_read_tokens: Option<i32>,
    pub cache_write_tokens: Option<i32>,
    /// True when the counts are an estimate (F3); defaults to false.
    pub estimated: bool,
}

#[async_trait]
pub trait LlmUsageEventRepository: Send + Sync {
    async fn record(&self, data: RecordLlmUsageEventData) -> DomainResult<()>;
    /// Grouped by provider, most-recently-used first, counting only events at
    /// or after `since`. The caller decides that means "this calendar month"
    /// (JEF-250). Older events aren't deleted, just excluded from this sum.
    async fn summarize_by_user_id(
        &self,
        user_id: &str,
        since: DateTime<Utc>,
    ) -> DomainResult<Vec<LlmUsageSummary>>;
}
