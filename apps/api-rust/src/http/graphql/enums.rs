//! GraphQL enums shared across resolver modules. Each domain keeps its own
//! clearly separated block.

// ── OAuth accounts ──────────────────────────────────────────────────────────

use crate::domain::oauth_account::OAuthProviderName;

// A third-party sign-in provider.
#[derive(async_graphql::Enum, Debug, Clone, Copy, PartialEq, Eq)]
#[graphql(name = "OAuthProvider", rename_items = "lowercase")]
pub enum OAuthProviderEnum {
    Google,
    Github,
}

impl From<OAuthProviderEnum> for OAuthProviderName {
    fn from(provider: OAuthProviderEnum) -> Self {
        match provider {
            OAuthProviderEnum::Google => Self::Google,
            OAuthProviderEnum::Github => Self::Github,
        }
    }
}

impl From<OAuthProviderName> for OAuthProviderEnum {
    fn from(provider: OAuthProviderName) -> Self {
        match provider {
            OAuthProviderName::Google => Self::Google,
            OAuthProviderName::Github => Self::Github,
        }
    }
}

// ── end OAuth accounts ──────────────────────────────────────────────────────
