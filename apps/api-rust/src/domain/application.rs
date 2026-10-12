use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ApplicationStatus {
    Draft,
    Applied,
    Interviewing,
    Offered,
    Accepted,
    Rejected,
    Withdrawn,
}

impl ApplicationStatus {
    pub const ALL: [Self; 7] = [
        Self::Draft,
        Self::Applied,
        Self::Interviewing,
        Self::Offered,
        Self::Accepted,
        Self::Rejected,
        Self::Withdrawn,
    ];

    /// The value stored in `JobApplication.status` and sent over GraphQL.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Draft => "draft",
            Self::Applied => "applied",
            Self::Interviewing => "interviewing",
            Self::Offered => "offered",
            Self::Accepted => "accepted",
            Self::Rejected => "rejected",
            Self::Withdrawn => "withdrawn",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|status| status.as_str() == value)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Application {
    pub id: String,
    pub user_id: String,
    pub company: String,
    pub role: String,
    pub status: ApplicationStatus,
    pub job_url: Option<String>,
    pub location: Option<String>,
    pub salary_range: Option<String>,
    pub description: Option<String>,
    pub applied_at: Option<DateTime<Utc>>,
    pub starred: bool,
    pub source: Option<String>,
    pub follow_up_at: Option<DateTime<Utc>>,
    pub tags: Vec<String>,
    pub reminder_sent_at: Option<DateTime<Utc>>,
    /// Rank within its kanban column, ascending. Scoped to (user, status).
    pub board_position: i32,
    /// In Trash since; `None` for a live application.
    pub deleted_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_round_trips_through_its_stored_value() {
        for status in ApplicationStatus::ALL {
            assert_eq!(ApplicationStatus::parse(status.as_str()), Some(status));
        }
    }

    #[test]
    fn an_unknown_status_does_not_parse() {
        assert_eq!(ApplicationStatus::parse("ghosted"), None);
    }
}
