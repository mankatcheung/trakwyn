use async_trait::async_trait;
use reqwest::header::AUTHORIZATION;
use serde::Deserialize;

use crate::infrastructure::auth::oauth_http::{authorization_url, OAuthExchangeError};
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::oauth_provider::{OAuthProfile, OAuthProvider};

const CLIENT_ID_ENV: &str = "GOOGLE_OAUTH_CLIENT_ID";
const CLIENT_SECRET_ENV: &str = "GOOGLE_OAUTH_CLIENT_SECRET";
const SCOPE: &str = "openid email profile";

/// Where Google's OAuth endpoints live. `Default` is the real ones; tests
/// point them at a local stub.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GoogleOAuthEndpoints {
    pub authorization_url: String,
    pub token_url: String,
    pub userinfo_url: String,
}

impl Default for GoogleOAuthEndpoints {
    fn default() -> Self {
        Self {
            authorization_url: "https://accounts.google.com/o/oauth2/v2/auth".to_string(),
            token_url: "https://oauth2.googleapis.com/token".to_string(),
            userinfo_url: "https://openidconnect.googleapis.com/v1/userinfo".to_string(),
        }
    }
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: Option<String>,
}

#[derive(Deserialize)]
struct UserInfo {
    sub: String,
    email: Option<String>,
    email_verified: Option<bool>,
    name: Option<String>,
}

pub struct GoogleOAuthProvider {
    client_id: String,
    client_secret: String,
    endpoints: GoogleOAuthEndpoints,
    http: reqwest::Client,
}

impl GoogleOAuthProvider {
    /// `client_id`/`client_secret` are `GOOGLE_OAUTH_CLIENT_ID` and
    /// `GOOGLE_OAUTH_CLIENT_SECRET`; pass `""` for one that is not set.
    pub fn new(
        client_id: impl Into<String>,
        client_secret: impl Into<String>,
        endpoints: GoogleOAuthEndpoints,
        http: reqwest::Client,
    ) -> Self {
        Self { client_id: client_id.into(), client_secret: client_secret.into(), endpoints, http }
    }
}

#[async_trait]
impl OAuthProvider for GoogleOAuthProvider {
    fn get_authorization_url(
        &self,
        state: &str,
        redirect_uri: &str,
        code_challenge: &str,
    ) -> String {
        authorization_url(
            &self.endpoints.authorization_url,
            &[
                ("client_id", &self.client_id),
                ("redirect_uri", redirect_uri),
                ("response_type", "code"),
                ("scope", SCOPE),
                ("state", state),
                ("code_challenge", code_challenge),
                ("code_challenge_method", "S256"),
            ],
        )
    }

    async fn exchange_code_for_profile(
        &self,
        code: &str,
        redirect_uri: &str,
        code_verifier: &str,
    ) -> DomainResult<OAuthProfile> {
        if self.client_id.is_empty() || self.client_secret.is_empty() {
            return Err(OAuthExchangeError::not_set(CLIENT_ID_ENV, CLIENT_SECRET_ENV).into());
        }

        let token_response = self
            .http
            .post(&self.endpoints.token_url)
            .form(&[
                ("client_id", self.client_id.as_str()),
                ("client_secret", self.client_secret.as_str()),
                ("code", code),
                ("grant_type", "authorization_code"),
                ("redirect_uri", redirect_uri),
                ("code_verifier", code_verifier),
            ])
            .send()
            .await
            .map_err(DomainError::internal)?;
        if !token_response.status().is_success() {
            return Err(OAuthExchangeError::status(
                "Google token exchange failed",
                token_response.status(),
            )
            .into());
        }
        let token: TokenResponse = token_response.json().await.map_err(DomainError::internal)?;
        // apps/api does not check for a missing token here: it sends
        // `Bearer undefined` and lets the userinfo call fail with a 401.
        let access_token = token.access_token.unwrap_or_else(|| "undefined".to_string());

        let userinfo_response = self
            .http
            .get(&self.endpoints.userinfo_url)
            .header(AUTHORIZATION, format!("Bearer {access_token}"))
            .send()
            .await
            .map_err(DomainError::internal)?;
        if !userinfo_response.status().is_success() {
            return Err(OAuthExchangeError::status(
                "Google userinfo fetch failed",
                userinfo_response.status(),
            )
            .into());
        }
        let profile: UserInfo = userinfo_response.json().await.map_err(DomainError::internal)?;

        Ok(OAuthProfile {
            provider_account_id: profile.sub,
            email: profile.email,
            email_verified: profile.email_verified.unwrap_or(false),
            name: profile.name,
        })
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};

    use axum::extract::State;
    use axum::http::{HeaderMap, StatusCode};
    use axum::routing::{get, post};
    use axum::{Form, Json, Router};
    use serde_json::{json, Value};

    use super::*;
    use crate::infrastructure::auth::oauth_http::{oauth_http_client, test_support::serve};
    use crate::use_cases::errors::ErrorCode;

    /// A stand-in for Google's token and userinfo endpoints that records what
    /// it was sent.
    #[derive(Clone)]
    struct Stub {
        token: (StatusCode, Value),
        userinfo: (StatusCode, Value),
        token_forms: Arc<Mutex<Vec<HashMap<String, String>>>>,
        token_content_types: Arc<Mutex<Vec<String>>>,
        userinfo_authorizations: Arc<Mutex<Vec<String>>>,
    }

    impl Stub {
        fn new(token: (StatusCode, Value), userinfo: (StatusCode, Value)) -> Self {
            Self {
                token,
                userinfo,
                token_forms: Arc::default(),
                token_content_types: Arc::default(),
                userinfo_authorizations: Arc::default(),
            }
        }

        async fn provider(&self) -> GoogleOAuthProvider {
            self.provider_with("client-id", "client-secret").await
        }

        async fn provider_with(&self, id: &str, secret: &str) -> GoogleOAuthProvider {
            let router = Router::new()
                .route(
                    "/token",
                    post(
                        |State(stub): State<Stub>,
                         headers: HeaderMap,
                         Form(form): Form<HashMap<String, String>>| async move {
                            stub.token_forms.lock().unwrap().push(form);
                            stub.token_content_types
                                .lock()
                                .unwrap()
                                .push(headers["content-type"].to_str().unwrap().to_string());
                            (stub.token.0, Json(stub.token.1.clone()))
                        },
                    ),
                )
                .route(
                    "/userinfo",
                    get(|State(stub): State<Stub>, headers: HeaderMap| async move {
                        stub.userinfo_authorizations
                            .lock()
                            .unwrap()
                            .push(headers["authorization"].to_str().unwrap().to_string());
                        (stub.userinfo.0, Json(stub.userinfo.1.clone()))
                    }),
                )
                .with_state(self.clone());
            let base = serve(router).await;
            GoogleOAuthProvider::new(
                id,
                secret,
                GoogleOAuthEndpoints {
                    authorization_url: format!("{base}/authorize"),
                    token_url: format!("{base}/token"),
                    userinfo_url: format!("{base}/userinfo"),
                },
                oauth_http_client().unwrap(),
            )
        }
    }

    fn ok(body: Value) -> (StatusCode, Value) {
        (StatusCode::OK, body)
    }

    fn real_provider() -> GoogleOAuthProvider {
        GoogleOAuthProvider::new(
            "google-client-id.apps.example",
            "client-secret-not-real",
            GoogleOAuthEndpoints::default(),
            oauth_http_client().unwrap(),
        )
    }

    /// Output of `GoogleOAuthProvider.getAuthorizationUrl('st.ate_1-2',
    /// 'https://api.example.com/auth/oauth/google/callback', 'chal_lenge-1')`
    /// in `apps/api`, run under `tsx` with
    /// `GOOGLE_OAUTH_CLIENT_ID=google-client-id.apps.example`.
    #[test]
    fn builds_the_authorization_url_apps_api_builds() {
        let url = real_provider().get_authorization_url(
            "st.ate_1-2",
            "https://api.example.com/auth/oauth/google/callback",
            "chal_lenge-1",
        );

        assert_eq!(
            url,
            "https://accounts.google.com/o/oauth2/v2/auth?client_id=google-client-id.apps.example&redirect_uri=https%3A%2F%2Fapi.example.com%2Fauth%2Foauth%2Fgoogle%2Fcallback&response_type=code&scope=openid+email+profile&state=st.ate_1-2&code_challenge=chal_lenge-1&code_challenge_method=S256"
        );
    }

    #[tokio::test]
    async fn exchanges_the_code_for_a_token_then_fetches_and_maps_the_profile() {
        let stub = Stub::new(
            ok(json!({ "access_token": "tok" })),
            ok(json!({
                "sub": "google-sub-1",
                "email": "jeff@example.com",
                "email_verified": true,
                "name": "Jeff Man",
            })),
        );

        let profile = stub
            .provider()
            .await
            .exchange_code_for_profile("auth-code", "https://api/cb", "my-verifier")
            .await
            .unwrap();

        assert_eq!(
            profile,
            OAuthProfile {
                provider_account_id: "google-sub-1".to_string(),
                email: Some("jeff@example.com".to_string()),
                email_verified: true,
                name: Some("Jeff Man".to_string()),
            }
        );
        assert_eq!(*stub.userinfo_authorizations.lock().unwrap(), vec!["Bearer tok"]);
    }

    #[tokio::test]
    async fn sends_the_code_verifier_and_credentials_in_the_token_exchange() {
        // Without the verifier the challenge sent at /start is decorative:
        // the provider has nothing to check it against.
        let stub = Stub::new(
            ok(json!({ "access_token": "tok" })),
            ok(json!({ "sub": "1", "email": "a@b.c" })),
        );

        stub.provider()
            .await
            .exchange_code_for_profile("auth-code", "https://api/cb", "my-verifier")
            .await
            .unwrap();

        let forms = stub.token_forms.lock().unwrap();
        let expected: HashMap<String, String> = [
            ("client_id", "client-id"),
            ("client_secret", "client-secret"),
            ("code", "auth-code"),
            ("grant_type", "authorization_code"),
            ("redirect_uri", "https://api/cb"),
            ("code_verifier", "my-verifier"),
        ]
        .into_iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect();
        assert_eq!(*forms, vec![expected]);
        assert_eq!(
            *stub.token_content_types.lock().unwrap(),
            vec!["application/x-www-form-urlencoded"]
        );
    }

    #[tokio::test]
    async fn absent_profile_fields_become_none_and_unverified() {
        let stub = Stub::new(ok(json!({ "access_token": "tok" })), ok(json!({ "sub": "1" })));

        let profile = stub.provider().await.exchange_code_for_profile("c", "r", "v").await.unwrap();

        assert_eq!(
            profile,
            OAuthProfile {
                provider_account_id: "1".to_string(),
                email: None,
                email_verified: false,
                name: None,
            }
        );
    }

    #[tokio::test]
    async fn fails_when_the_token_exchange_fails() {
        let stub = Stub::new(
            (StatusCode::BAD_REQUEST, json!({ "error": "invalid_grant" })),
            ok(json!({})),
        );

        let err = stub
            .provider()
            .await
            .exchange_code_for_profile("bad-code", "https://api/cb", "my-verifier")
            .await
            .unwrap_err();

        assert_eq!(err.code(), ErrorCode::InternalError);
        assert!(err.to_string().contains("Google token exchange failed: 400"));
        assert!(stub.userinfo_authorizations.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn fails_when_the_userinfo_fetch_fails() {
        let stub =
            Stub::new(ok(json!({ "access_token": "tok" })), (StatusCode::UNAUTHORIZED, json!({})));

        let err = stub.provider().await.exchange_code_for_profile("c", "r", "v").await.unwrap_err();

        assert!(err.to_string().contains("Google userinfo fetch failed: 401"));
    }

    #[tokio::test]
    async fn a_token_response_without_a_token_fails_at_the_userinfo_call() {
        let stub = Stub::new(ok(json!({})), (StatusCode::UNAUTHORIZED, json!({})));

        let err = stub.provider().await.exchange_code_for_profile("c", "r", "v").await.unwrap_err();

        assert!(err.to_string().contains("Google userinfo fetch failed: 401"));
        assert_eq!(*stub.userinfo_authorizations.lock().unwrap(), vec!["Bearer undefined"]);
    }

    #[tokio::test]
    async fn fails_when_client_credentials_are_not_configured() {
        let stub = Stub::new(ok(json!({ "access_token": "tok" })), ok(json!({ "sub": "1" })));

        for (id, secret) in [("", "client-secret"), ("client-id", ""), ("", "")] {
            let err = stub
                .provider_with(id, secret)
                .await
                .exchange_code_for_profile("code", "https://api/cb", "my-verifier")
                .await
                .unwrap_err();
            assert!(err
                .to_string()
                .contains("GOOGLE_OAUTH_CLIENT_ID/GOOGLE_OAUTH_CLIENT_SECRET not set"));
        }
        assert!(stub.token_forms.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn fails_when_the_provider_cannot_be_reached() {
        let provider = GoogleOAuthProvider::new(
            "client-id",
            "client-secret",
            GoogleOAuthEndpoints {
                authorization_url: "http://127.0.0.1:1/authorize".to_string(),
                token_url: "http://127.0.0.1:1/token".to_string(),
                userinfo_url: "http://127.0.0.1:1/userinfo".to_string(),
            },
            oauth_http_client().unwrap(),
        );

        let err = provider.exchange_code_for_profile("c", "r", "v").await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::InternalError);
    }
}
