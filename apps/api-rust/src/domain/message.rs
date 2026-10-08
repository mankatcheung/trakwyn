use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum MessageRole {
    User,
    Assistant,
}

impl MessageRole {
    pub const ALL: [Self; 2] = [Self::User, Self::Assistant];

    /// The value stored in `Message.role` and sent over GraphQL.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::User => "user",
            Self::Assistant => "assistant",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|role| role.as_str() == value)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Message {
    pub id: String,
    pub conversation_id: String,
    pub role: MessageRole,
    pub content: String,
    /// Tool lookups behind an assistant reply, one line each; `None` when none (F10).
    pub tool_trace: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn role_round_trips_through_its_stored_value() {
        for role in MessageRole::ALL {
            assert_eq!(MessageRole::parse(role.as_str()), Some(role));
        }
    }

    #[test]
    fn an_unknown_role_does_not_parse() {
        assert_eq!(MessageRole::parse("system"), None);
    }
}
