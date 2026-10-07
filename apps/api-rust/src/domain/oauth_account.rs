use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum OAuthProviderName {
    Google,
    Github,
}

impl OAuthProviderName {
    pub const ALL: [Self; 2] = [Self::Google, Self::Github];

    /// The value stored in `OAuthAccount.provider` and sent over GraphQL.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Google => "google",
            Self::Github => "github",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|provider| provider.as_str() == value)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OAuthAccount {
    pub id: String,
    pub user_id: String,
    pub provider: OAuthProviderName,
    pub provider_account_id: String,
    pub email: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_round_trips_through_its_stored_value() {
        for provider in OAuthProviderName::ALL {
            assert_eq!(OAuthProviderName::parse(provider.as_str()), Some(provider));
        }
    }

    #[test]
    fn an_unknown_provider_does_not_parse() {
        assert_eq!(OAuthProviderName::parse("gitlab"), None);
    }
}
