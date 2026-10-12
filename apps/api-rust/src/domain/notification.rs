use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum NotificationType {
    InterviewReminder,
    FollowUpReminder,
    SecurityAlert,
}

impl NotificationType {
    pub const ALL: [Self; 3] =
        [Self::InterviewReminder, Self::FollowUpReminder, Self::SecurityAlert];

    /// The value stored in `Notification.type` and sent over GraphQL.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::InterviewReminder => "interview_reminder",
            Self::FollowUpReminder => "follow_up_reminder",
            Self::SecurityAlert => "security_alert",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|notification_type| notification_type.as_str() == value)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Notification {
    pub id: String,
    pub user_id: String,
    pub notification_type: NotificationType,
    pub title: String,
    pub body: String,
    /// Where clicking the notification navigates to; `None` if not actionable.
    pub url: Option<String>,
    /// `None` = unread. Set to the time the user marked it read.
    pub read_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn type_round_trips_through_its_stored_value() {
        for notification_type in NotificationType::ALL {
            assert_eq!(
                NotificationType::parse(notification_type.as_str()),
                Some(notification_type)
            );
        }
    }

    #[test]
    fn an_unknown_type_does_not_parse() {
        assert_eq!(NotificationType::parse("newsletter"), None);
    }
}
