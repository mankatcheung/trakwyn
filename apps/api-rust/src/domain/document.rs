use chrono::{DateTime, Utc};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Document {
    pub id: String,
    pub application_id: String,
    pub name: String,
    pub mime_type: String,
    pub size_bytes: i32,
    pub storage_key: String,
    pub document_type: String,
    pub version: Option<String>,
    pub source_draft_id: Option<String>,
    pub created_at: DateTime<Utc>,
}
