use chrono::{DateTime, Utc};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LlmApiKey {
    pub id: String,
    pub user_id: String,
    pub provider: String,
    /// Encrypted at rest.
    pub api_key: String,
    pub model: Option<String>,
    pub base_url: Option<String>,
    /// Monthly prompt+completion token ceiling; `None` means no limit (JEF-258).
    pub monthly_token_limit: Option<i64>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
