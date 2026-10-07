/// A third-party identity provider a user can sign in with.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum OAuthProviderName {
    Google,
    Github,
}

impl OAuthProviderName {
    pub const ALL: [Self; 2] = [Self::Google, Self::Github];

    /// The value stored in `OAuthAccount.provider` and used in route paths.
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_the_stored_spelling_only() {
        assert_eq!(OAuthProviderName::parse("google"), Some(OAuthProviderName::Google));
        assert_eq!(OAuthProviderName::parse("github"), Some(OAuthProviderName::Github));
        assert_eq!(OAuthProviderName::parse("GitHub"), None);
        assert_eq!(OAuthProviderName::parse("twitter"), None);
    }
}
