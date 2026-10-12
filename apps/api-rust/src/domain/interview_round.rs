use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum InterviewRoundType {
    Phone,
    Technical,
    Onsite,
    Hr,
    Other,
}

impl InterviewRoundType {
    pub const ALL: [Self; 5] = [Self::Phone, Self::Technical, Self::Onsite, Self::Hr, Self::Other];

    /// The value stored in `InterviewRound.type` and sent over GraphQL.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Phone => "phone",
            Self::Technical => "technical",
            Self::Onsite => "onsite",
            Self::Hr => "hr",
            Self::Other => "other",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|round_type| round_type.as_str() == value)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum InterviewRoundOutcome {
    Pending,
    Passed,
    Failed,
    Cancelled,
}

impl InterviewRoundOutcome {
    pub const ALL: [Self; 4] = [Self::Pending, Self::Passed, Self::Failed, Self::Cancelled];

    /// The value stored in `InterviewRound.outcome` and sent over GraphQL.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Passed => "passed",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|outcome| outcome.as_str() == value)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InterviewRound {
    pub id: String,
    pub application_id: String,
    pub r#type: InterviewRoundType,
    pub scheduled_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub interviewer_name: Option<String>,
    pub notes: Option<String>,
    pub outcome: InterviewRoundOutcome,
    pub push_notification_sent_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn type_and_outcome_round_trip_through_their_stored_values() {
        for round_type in InterviewRoundType::ALL {
            assert_eq!(InterviewRoundType::parse(round_type.as_str()), Some(round_type));
        }
        for outcome in InterviewRoundOutcome::ALL {
            assert_eq!(InterviewRoundOutcome::parse(outcome.as_str()), Some(outcome));
        }
    }

    #[test]
    fn unknown_values_do_not_parse() {
        assert_eq!(InterviewRoundType::parse("lunch"), None);
        assert_eq!(InterviewRoundOutcome::parse("ghosted"), None);
    }
}
