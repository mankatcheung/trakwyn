use chrono::{DateTime, Utc};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Skill {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub category: Option<String>,
    pub proficiency: Option<String>,
    pub created_at: DateTime<Utc>,
}
