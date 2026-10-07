use chrono::{DateTime, Utc};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShareLink {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub token_hash: String,
    pub last_used_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}
