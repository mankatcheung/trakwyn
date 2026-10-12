use crate::domain::api_token::ApiTokenScope;
use crate::domain::mcp_oauth::McpOAuthScope;
use crate::use_cases::api_tokens::ValidateApiTokenUseCase;
use crate::use_cases::constants::{api_token, mcp_oauth};
use crate::use_cases::mcp_oauth::ValidateMcpOAuthAccessTokenUseCase;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthenticateMcpRequestResult {
    pub sub: String,
    /// The token's scope, carried through so the caller can gate write tools.
    /// Both scopes reach MCP, so "authenticated" is not "may mutate".
    ///
    /// An OAuth access token carries the scope the user consented to, and it
    /// lands in this same field: consenting to `read` buys exactly what a
    /// read-only API token buys. The match below has no wildcard, so a new
    /// scope on either side stops this building rather than silently
    /// widening what a grant permits.
    pub scope: ApiTokenScope,
}

const fn api_scope(scope: McpOAuthScope) -> ApiTokenScope {
    match scope {
        McpOAuthScope::Read => ApiTokenScope::Read,
        McpOAuthScope::Full => ApiTokenScope::Full,
    }
}

/// Authenticates an MCP request's Bearer credential: either a manually-created
/// API token (`trakwyn_...`) or an OAuth access token (`trakwyn_mcp_...`).
///
/// Accepts any scope (full or read), unlike GraphQL which requires full, and
/// returns it so write tools can be refused to read credentials. Rejects JWTs
/// and any other credential. `None` for invalid, expired or unrecognised ones,
/// and for a lookup that fails.
pub struct AuthenticateMcpRequestUseCase {
    pub validate_api_token_use_case: ValidateApiTokenUseCase,
    pub validate_mcp_oauth_access_token_use_case: Option<ValidateMcpOAuthAccessTokenUseCase>,
}

impl AuthenticateMcpRequestUseCase {
    pub async fn execute(&self, raw_token: &str) -> Option<AuthenticateMcpRequestResult> {
        // Checked first: `ACCESS_TOKEN_PREFIX` (`trakwyn_mcp_`) extends the API
        // token prefix (`trakwyn_`), so testing the API-token prefix first
        // would swallow every OAuth token and hand it to the wrong validator.
        if raw_token.starts_with(mcp_oauth::ACCESS_TOKEN_PREFIX) {
            let validator = self.validate_mcp_oauth_access_token_use_case.as_ref()?;
            let result = validator.execute(raw_token).await.ok()??;
            return Some(AuthenticateMcpRequestResult {
                sub: result.sub,
                scope: api_scope(result.scope),
            });
        }

        if !raw_token.starts_with(api_token::PREFIX) {
            return None;
        }
        let result = self.validate_api_token_use_case.execute(raw_token).await.ok()??;
        Some(AuthenticateMcpRequestResult { sub: result.sub, scope: result.scope })
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use chrono::{Duration, Utc};

    use super::*;
    use crate::domain::api_token::ApiToken;
    use crate::domain::mcp_oauth::McpOAuthAccessToken;
    use crate::use_cases::secret_token;
    use crate::use_cases::test_support::{FakeApiTokenRepository, FakeMcpOAuthTokenRepository};

    const API_TOKEN: &str = "trakwyn_apitoken";
    const OAUTH_TOKEN: &str = "trakwyn_mcp_oauthtoken";

    fn use_case(oauth: bool) -> AuthenticateMcpRequestUseCase {
        let api_tokens = FakeApiTokenRepository::with(vec![ApiToken {
            id: "t1".to_string(),
            user_id: "api-user".to_string(),
            name: "CI".to_string(),
            token_hash: secret_token::hash(API_TOKEN),
            scope: ApiTokenScope::Read,
            last_used_at: None,
            created_at: Utc::now(),
        }])
        .with_user("api-user", "api@example.com");
        let access_tokens =
            Arc::new(FakeMcpOAuthTokenRepository::with(vec![McpOAuthAccessToken {
                id: "a1".to_string(),
                user_id: "oauth-user".to_string(),
                client_id: "c".to_string(),
                family_id: "f".to_string(),
                token_hash: secret_token::hash(OAUTH_TOKEN),
                scope: McpOAuthScope::Read,
                audience: "/mcp".to_string(),
                expires_at: Utc::now() + Duration::hours(1),
                revoked_at: None,
                last_used_at: None,
                created_at: Utc::now(),
            }]));
        AuthenticateMcpRequestUseCase {
            validate_api_token_use_case: ValidateApiTokenUseCase {
                api_token_repository: Arc::new(api_tokens),
            },
            validate_mcp_oauth_access_token_use_case: oauth.then(|| {
                ValidateMcpOAuthAccessTokenUseCase { mcp_oauth_token_repository: access_tokens }
            }),
        }
    }

    #[tokio::test]
    async fn accepts_an_api_token_of_any_scope_and_returns_the_scope() {
        let result = use_case(true).execute(API_TOKEN).await.unwrap();
        assert_eq!(result.sub, "api-user");
        assert_eq!(result.scope, ApiTokenScope::Read);
    }

    #[tokio::test]
    async fn sends_an_oauth_token_to_the_oauth_validator_and_keeps_its_scope() {
        let result = use_case(true).execute(OAUTH_TOKEN).await.unwrap();
        assert_eq!(result.sub, "oauth-user");
        assert_eq!(result.scope, ApiTokenScope::Read);
    }

    #[tokio::test]
    async fn rejects_an_oauth_token_when_no_oauth_validator_is_wired() {
        assert_eq!(use_case(false).execute(OAUTH_TOKEN).await, None);
    }

    #[tokio::test]
    async fn rejects_jwts_unknown_tokens_and_anything_else() {
        let use_case = use_case(true);
        for raw in ["eyJhbGciOiJIUzI1NiJ9.e30.sig", "trakwyn_unknown", "trakwyn_mcp_unknown", ""] {
            assert_eq!(use_case.execute(raw).await, None, "{raw}");
        }
    }
}
