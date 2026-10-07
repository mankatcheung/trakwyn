use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ApiTokenScope {
    Full,
    Read,
}

impl ApiTokenScope {
    pub const ALL: [Self; 2] = [Self::Full, Self::Read];

    /// The value stored in `ApiToken.scope`.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Full => "full",
            Self::Read => "read",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|scope| scope.as_str() == value)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApiToken {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub token_hash: String,
    pub scope: ApiTokenScope,
    pub last_used_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scope_round_trips_through_its_stored_value() {
        for scope in ApiTokenScope::ALL {
            assert_eq!(ApiTokenScope::parse(scope.as_str()), Some(scope));
        }
    }

    #[test]
    fn an_unknown_scope_does_not_parse() {
        assert_eq!(ApiTokenScope::parse("admin"), None);
    }
}
