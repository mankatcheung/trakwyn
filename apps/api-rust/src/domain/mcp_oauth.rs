//! The MCP OAuth entities: the registered client, the authorization code that
//! records a consent, and the access and refresh tokens descended from it.

use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum McpOAuthScope {
    Read,
    Full,
}

impl McpOAuthScope {
    pub const ALL: [Self; 2] = [Self::Read, Self::Full];

    /// The value stored in the `scope` column of every MCP OAuth table.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Read => "read",
            Self::Full => "full",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|scope| scope.as_str() == value)
    }
}

/// The PKCE methods an authorization code may carry. Only S256 is accepted.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum McpOAuthCodeChallengeMethod {
    S256,
}

impl McpOAuthCodeChallengeMethod {
    pub const ALL: [Self; 1] = [Self::S256];

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::S256 => "S256",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|method| method.as_str() == value)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct McpOAuthAccessToken {
    pub id: String,
    pub user_id: String,
    pub client_id: String,
    /// Grant id shared with the authorization code and refresh tokens.
    pub family_id: String,
    pub token_hash: String,
    pub scope: McpOAuthScope,
    pub audience: String,
    pub expires_at: DateTime<Utc>,
    pub revoked_at: Option<DateTime<Utc>>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct McpOAuthAuthorizationCode {
    pub id: String,
    pub code_hash: String,
    /// Grant id, inherited by every token this code yields.
    pub family_id: String,
    pub client_id: String,
    pub user_id: String,
    pub redirect_uri: String,
    pub scope: McpOAuthScope,
    pub code_challenge: String,
    pub code_challenge_method: McpOAuthCodeChallengeMethod,
    pub expires_at: DateTime<Utc>,
    pub consumed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct McpOAuthClient {
    pub id: String,
    pub name: String,
    pub redirect_uris: Vec<String>,
    pub revoked_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

/// One consent, as the user who gave it would describe it: this client, this
/// much access, since then.
///
/// Not a table. A grant is the `family_id` that ties an authorization code to
/// every access and refresh token descended from it, so this is assembled from
/// those: the code records what was consented to and when, the refresh tokens
/// say whether it is still live, and the access tokens say when it was last
/// used.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct McpOAuthGrant {
    /// The grant id, i.e. the family id. Revoking this ends the whole grant.
    pub id: String,
    pub user_id: String,
    pub client_id: String,
    /// The name the client registered itself under.
    pub client_name: String,
    pub scope: McpOAuthScope,
    pub authorized_at: DateTime<Utc>,
    /// When a token from this grant last reached /mcp; `None` if never used.
    pub last_used_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct McpOAuthRefreshToken {
    pub id: String,
    pub token_hash: String,
    pub family_id: String,
    pub client_id: String,
    pub user_id: String,
    pub scope: McpOAuthScope,
    pub expires_at: DateTime<Utc>,
    pub used_at: Option<DateTime<Utc>>,
    pub revoked_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scope_round_trips_through_its_stored_value() {
        for scope in McpOAuthScope::ALL {
            assert_eq!(McpOAuthScope::parse(scope.as_str()), Some(scope));
        }
        assert_eq!(McpOAuthScope::parse("admin"), None);
    }

    #[test]
    fn only_s256_is_a_code_challenge_method() {
        assert_eq!(
            McpOAuthCodeChallengeMethod::parse("S256"),
            Some(McpOAuthCodeChallengeMethod::S256)
        );
        assert_eq!(McpOAuthCodeChallengeMethod::parse("plain"), None);
    }
}
