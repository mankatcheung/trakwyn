use chrono::{DateTime, Utc};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompanyBriefing {
    pub id: String,
    pub application_id: String,
    pub content: String,
    pub generated_at: DateTime<Utc>,
}
