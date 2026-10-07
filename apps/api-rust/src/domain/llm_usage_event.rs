use chrono::{DateTime, Utc};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LlmUsageEvent {
    pub id: String,
    pub user_id: String,
    pub provider: String,
    pub model: Option<String>,
    pub prompt_tokens: i32,
    pub completion_tokens: i32,
    pub cache_read_tokens: Option<i32>,
    pub cache_write_tokens: Option<i32>,
    /// Counts estimated from the request rather than reported by the provider (F3).
    pub estimated: bool,
    pub created_at: DateTime<Utc>,
}

/// One provider's usage since the cutoff the caller asked for: the shape
/// `LlmUsageEventRepository::summarize_by_user_id` returns, aggregated across
/// every model that provider's key has been used with (JEF-250). No cost
/// estimate: list prices drift, and a stale number is worse than none. Token
/// counts only, scoped to the current calendar month by the usage-summary use
/// case; older events aren't deleted, just excluded.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LlmUsageSummary {
    pub provider: String,
    pub request_count: i64,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    /// Summed over the events that reported a split (T3); the share of
    /// `prompt_tokens` that was a cache hit / write. Zero both when nothing
    /// was cached and when the provider never says.
    pub cache_read_tokens: i64,
    pub cache_write_tokens: i64,
    pub last_used_at: DateTime<Utc>,
}

/// A provider's usage alongside the ceiling set on its key (JEF-258).
///
/// `limit_reached` is computed once, by the usage-summary use case, from the
/// same check the provider factory refuses on, so what the meter shows and
/// what the API allows cannot disagree.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LlmUsageSummaryWithLimit {
    pub provider: String,
    pub request_count: i64,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub cache_read_tokens: i64,
    pub cache_write_tokens: i64,
    pub last_used_at: DateTime<Utc>,
    pub monthly_token_limit: Option<i64>,
    pub limit_reached: bool,
}
