use std::sync::Arc;

use crate::use_cases::constants::api_token;
use crate::use_cases::ports::{SessionBlocklist, TokenService};

/// Who a request is acting as.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthenticatedUser {
    pub sub: String,
    pub email: String,
    /// Session id: present for a JWT, absent for API-token auth (no session).
    pub sid: Option<String>,
    /// Epoch-ms of the session's last full authentication; absent for API-token auth.
    pub auth_time: Option<i64>,
}

/// Authenticates a raw access token: a JWT (cookie or Bearer, from login) or
/// an API token (`trakwyn_...` Bearer, for programmatic access).
///
/// Returns `None` for any invalid, expired or insufficiently scoped token.
///
/// A valid JWT signature is necessary but not sufficient: its session may
/// have been revoked (logout, "sign out other sessions", password reset,
/// refresh-token reuse) since it was issued, so the `sid` is also checked
/// against the revocation blocklist.
pub struct AuthenticateRequestUseCase {
    pub token_service: Arc<dyn TokenService>,
    pub session_blocklist: Arc<dyn SessionBlocklist>,
}

impl AuthenticateRequestUseCase {
    pub async fn execute(&self, raw_token: &str) -> Option<AuthenticatedUser> {
        if raw_token.starts_with(api_token::PREFIX) {
            // API tokens are not ported yet, so one is refused rather than
            // mistaken for a JWT. Tracked in `tests/sdl_parity.rs`.
            return None;
        }

        let claims = self.token_service.verify_access(raw_token)?;

        if let Some(sid) = &claims.sid {
            if self.session_blocklist.is_revoked(sid).await {
                return None;
            }
        }

        Some(AuthenticatedUser {
            sub: claims.sub,
            email: claims.email,
            sid: claims.sid,
            auth_time: claims.auth_time,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::use_cases::ports::AccessClaims;
    use crate::use_cases::test_support::{FakeSessionBlocklist, FakeTokenService};

    fn claims(sid: Option<&str>) -> AccessClaims {
        AccessClaims {
            sub: "user-1".to_string(),
            email: "a@example.com".to_string(),
            sid: sid.map(str::to_string),
            auth_time: Some(1_700_000_000_000),
        }
    }

    fn use_case(
        tokens: FakeTokenService,
        blocklist: Arc<FakeSessionBlocklist>,
    ) -> AuthenticateRequestUseCase {
        AuthenticateRequestUseCase { token_service: Arc::new(tokens), session_blocklist: blocklist }
    }

    #[tokio::test]
    async fn accepts_a_valid_jwt() {
        let tokens = FakeTokenService::default().with_access("good", claims(Some("sid-1")));
        let user = use_case(tokens, Arc::default()).execute("good").await.unwrap();

        assert_eq!(user.sub, "user-1");
        assert_eq!(user.sid.as_deref(), Some("sid-1"));
        assert_eq!(user.auth_time, Some(1_700_000_000_000));
    }

    #[tokio::test]
    async fn rejects_a_token_that_does_not_verify() {
        let user = use_case(FakeTokenService::default(), Arc::default()).execute("forged").await;
        assert_eq!(user, None);
    }

    #[tokio::test]
    async fn rejects_a_jwt_whose_session_was_revoked() {
        let tokens = FakeTokenService::default().with_access("good", claims(Some("sid-1")));
        let blocklist = Arc::new(FakeSessionBlocklist::default());
        blocklist.revoke("sid-1").await;

        assert_eq!(use_case(tokens, blocklist).execute("good").await, None);
    }

    #[tokio::test]
    async fn accepts_a_jwt_with_no_session_id() {
        let tokens = FakeTokenService::default().with_access("legacy", claims(None));
        let user = use_case(tokens, Arc::default()).execute("legacy").await.unwrap();
        assert_eq!(user.sid, None);
    }

    #[tokio::test]
    async fn refuses_an_api_token_without_trying_it_as_a_jwt() {
        // Registered as a verifiable JWT on purpose: the prefix alone must
        // route it away from the JWT path.
        let tokens = FakeTokenService::default().with_access("trakwyn_abc", claims(None));
        assert_eq!(use_case(tokens, Arc::default()).execute("trakwyn_abc").await, None);
    }
}
