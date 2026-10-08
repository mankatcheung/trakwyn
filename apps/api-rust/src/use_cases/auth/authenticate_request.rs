use std::sync::Arc;

use crate::domain::api_token::ApiTokenScope;
use crate::use_cases::api_tokens::ValidateApiTokenUseCase;
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
/// Only FULL-scoped API tokens are accepted; READ-scoped tokens are MCP-only.
/// Returns `None` for any invalid, expired or insufficiently scoped token.
///
/// A valid JWT signature is necessary but not sufficient: its session may
/// have been revoked (logout, "sign out other sessions", password reset,
/// refresh-token reuse) since it was issued, so the `sid` is also checked
/// against the revocation blocklist.
pub struct AuthenticateRequestUseCase {
    pub token_service: Arc<dyn TokenService>,
    pub validate_api_token_use_case: ValidateApiTokenUseCase,
    pub session_blocklist: Arc<dyn SessionBlocklist>,
}

impl AuthenticateRequestUseCase {
    pub async fn execute(&self, raw_token: &str) -> Option<AuthenticatedUser> {
        if raw_token.starts_with(api_token::PREFIX) {
            // A failed lookup is "not authenticated", never an error: the
            // prefix alone routes the token here, so it is not tried as a JWT.
            let result = self.validate_api_token_use_case.execute(raw_token).await.ok()??;
            return (result.scope == ApiTokenScope::Full).then_some(AuthenticatedUser {
                sub: result.sub,
                email: result.email,
                sid: None,
                auth_time: None,
            });
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
    use async_trait::async_trait;
    use chrono::{DateTime, Utc};

    use super::*;
    use crate::domain::api_token::ApiToken;
    use crate::use_cases::errors::{DomainError, DomainResult};
    use crate::use_cases::ports::{
        AccessClaims, ApiTokenRepository, ApiTokenWithUserEmail, CreateApiTokenData,
    };
    use crate::use_cases::secret_token;
    use crate::use_cases::test_support::{
        FakeApiTokenRepository, FakeSessionBlocklist, FakeTokenService,
    };

    const FULL_TOKEN: &str = "trakwyn_full";
    const READ_TOKEN: &str = "trakwyn_read";

    fn claims(sid: Option<&str>) -> AccessClaims {
        AccessClaims {
            sub: "user-1".to_string(),
            email: "a@example.com".to_string(),
            sid: sid.map(str::to_string),
            auth_time: Some(1_700_000_000_000),
        }
    }

    fn api_token(id: &str, raw: &str, scope: ApiTokenScope) -> ApiToken {
        ApiToken {
            id: id.to_string(),
            user_id: "user-1".to_string(),
            name: id.to_string(),
            token_hash: secret_token::hash(raw),
            scope,
            last_used_at: None,
            created_at: DateTime::<Utc>::UNIX_EPOCH,
        }
    }

    fn api_tokens() -> Arc<FakeApiTokenRepository> {
        Arc::new(
            FakeApiTokenRepository::with(vec![
                api_token("full", FULL_TOKEN, ApiTokenScope::Full),
                api_token("read", READ_TOKEN, ApiTokenScope::Read),
            ])
            .with_user("user-1", "a@example.com"),
        )
    }

    fn use_case_with(
        tokens: FakeTokenService,
        api_tokens: Arc<dyn ApiTokenRepository>,
        blocklist: Arc<FakeSessionBlocklist>,
    ) -> AuthenticateRequestUseCase {
        AuthenticateRequestUseCase {
            token_service: Arc::new(tokens),
            validate_api_token_use_case: ValidateApiTokenUseCase {
                api_token_repository: api_tokens,
            },
            session_blocklist: blocklist,
        }
    }

    fn use_case(
        tokens: FakeTokenService,
        blocklist: Arc<FakeSessionBlocklist>,
    ) -> AuthenticateRequestUseCase {
        use_case_with(tokens, api_tokens(), blocklist)
    }

    /// A token store that is down.
    struct FailingApiTokenRepository;

    fn down<T>() -> DomainResult<T> {
        Err(DomainError::internal("connection refused"))
    }

    #[async_trait]
    impl ApiTokenRepository for FailingApiTokenRepository {
        async fn find_all_by_user_id(&self, _user_id: &str) -> DomainResult<Vec<ApiToken>> {
            down()
        }
        async fn find_by_id(&self, _id: &str) -> DomainResult<Option<ApiToken>> {
            down()
        }
        async fn find_by_token_hash(
            &self,
            _token_hash: &str,
        ) -> DomainResult<Option<ApiTokenWithUserEmail>> {
            down()
        }
        async fn create(&self, _data: CreateApiTokenData) -> DomainResult<ApiToken> {
            down()
        }
        async fn update_last_used(&self, _id: &str) -> DomainResult<()> {
            down()
        }
        async fn delete(&self, _id: &str) -> DomainResult<()> {
            down()
        }
        async fn find_by_id_and_user_id(
            &self,
            _id: &str,
            _user_id: &str,
        ) -> DomainResult<Option<ApiToken>> {
            down()
        }
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
    async fn accepts_a_full_scope_api_token_with_no_session() {
        let api_tokens = api_tokens();
        let use_case =
            use_case_with(FakeTokenService::default(), api_tokens.clone(), Arc::default());

        let user = use_case.execute(FULL_TOKEN).await.unwrap();

        assert_eq!(
            user,
            AuthenticatedUser {
                sub: "user-1".to_string(),
                email: "a@example.com".to_string(),
                sid: None,
                auth_time: None,
            }
        );
        let used = api_tokens.all().into_iter().find(|token| token.id == "full").unwrap();
        assert!(used.last_used_at.is_some());
    }

    #[tokio::test]
    async fn rejects_a_read_scope_api_token() {
        let user = use_case(FakeTokenService::default(), Arc::default()).execute(READ_TOKEN).await;
        assert_eq!(user, None);
    }

    #[tokio::test]
    async fn rejects_an_api_token_that_is_not_found() {
        let user =
            use_case(FakeTokenService::default(), Arc::default()).execute("trakwyn_unknown").await;
        assert_eq!(user, None);
    }

    #[tokio::test]
    async fn rejects_an_api_token_when_validation_fails() {
        let use_case = use_case_with(
            FakeTokenService::default(),
            Arc::new(FailingApiTokenRepository),
            Arc::default(),
        );
        assert_eq!(use_case.execute(FULL_TOKEN).await, None);
    }

    #[tokio::test]
    async fn never_tries_an_api_token_as_a_jwt() {
        // Registered as a verifiable JWT on purpose: the prefix alone must
        // route it away from the JWT path.
        let tokens = FakeTokenService::default().with_access("trakwyn_abc", claims(None));
        assert_eq!(use_case(tokens, Arc::default()).execute("trakwyn_abc").await, None);
    }

    #[tokio::test]
    async fn an_api_token_is_not_subject_to_the_session_blocklist() {
        let blocklist = Arc::new(FakeSessionBlocklist::default());
        blocklist.revoke("user-1").await;
        blocklist.revoke(FULL_TOKEN).await;

        let user = use_case(FakeTokenService::default(), blocklist).execute(FULL_TOKEN).await;

        assert!(user.is_some());
    }
}
