use async_trait::async_trait;
use reqwest::header::{ACCEPT, AUTHORIZATION};
use serde::Deserialize;

use crate::infrastructure::auth::oauth_http::{authorization_url, OAuthExchangeError};
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::oauth_provider::{OAuthProfile, OAuthProvider};

const CLIENT_ID_ENV: &str = "GITHUB_OAUTH_CLIENT_ID";
const CLIENT_SECRET_ENV: &str = "GITHUB_OAUTH_CLIENT_SECRET";
const SCOPE: &str = "read:user user:email";

/// Where GitHub's OAuth endpoints live. `Default` is the real ones; tests
/// point them at a local stub.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitHubOAuthEndpoints {
    pub authorization_url: String,
    pub token_url: String,
    pub user_url: String,
    pub emails_url: String,
}

impl Default for GitHubOAuthEndpoints {
    fn default() -> Self {
        Self {
            authorization_url: "https://github.com/login/oauth/authorize".to_string(),
            token_url: "https://github.com/login/oauth/access_token".to_string(),
            user_url: "https://api.github.com/user".to_string(),
            emails_url: "https://api.github.com/user/emails".to_string(),
        }
    }
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: Option<String>,
    error: Option<String>,
}

#[derive(Deserialize)]
struct User {
    id: serde_json::Number,
    name: Option<String>,
    email: Option<String>,
}

#[derive(Deserialize)]
struct Email {
    email: String,
    #[serde(default)]
    primary: bool,
    #[serde(default)]
    verified: bool,
}

pub struct GitHubOAuthProvider {
    client_id: String,
    client_secret: String,
    endpoints: GitHubOAuthEndpoints,
    http: reqwest::Client,
}

impl GitHubOAuthProvider {
    /// `client_id`/`client_secret` are `GITHUB_OAUTH_CLIENT_ID` and
    /// `GITHUB_OAUTH_CLIENT_SECRET`; pass `""` for one that is not set.
    pub fn new(
        client_id: impl Into<String>,
        client_secret: impl Into<String>,
        endpoints: GitHubOAuthEndpoints,
        http: reqwest::Client,
    ) -> Self {
        Self { client_id: client_id.into(), client_secret: client_secret.into(), endpoints, http }
    }
}

#[async_trait]
impl OAuthProvider for GitHubOAuthProvider {
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
                ("scope", SCOPE),
                ("state", state),
                // GitHub shipped PKCE for OAuth Apps in July 2025 and accepts S256 only.
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
            .header(ACCEPT, "application/json")
            .form(&[
                ("client_id", self.client_id.as_str()),
                ("client_secret", self.client_secret.as_str()),
                ("code", code),
                ("redirect_uri", redirect_uri),
                ("code_verifier", code_verifier),
            ])
            .send()
            .await
            .map_err(DomainError::internal)?;
        if !token_response.status().is_success() {
            return Err(OAuthExchangeError::status(
                "GitHub token exchange failed",
                token_response.status(),
            )
            .into());
        }
        // GitHub reports a refused code with a 200 and an `error` field.
        let token: TokenResponse = token_response.json().await.map_err(DomainError::internal)?;
        let Some(access_token) = token.access_token.filter(|value| !value.is_empty()) else {
            let reason = token.error.unwrap_or_else(|| "no access_token".to_string());
            return Err(
                OAuthExchangeError::new(format!("GitHub token exchange failed: {reason}")).into()
            );
        };
        let authorization = format!("Bearer {access_token}");

        let user_response = self
            .http
            .get(&self.endpoints.user_url)
            .header(AUTHORIZATION, &authorization)
            .send()
            .await
            .map_err(DomainError::internal)?;
        if !user_response.status().is_success() {
            return Err(OAuthExchangeError::status(
                "GitHub user fetch failed",
                user_response.status(),
            )
            .into());
        }
        let user: User = user_response.json().await.map_err(DomainError::internal)?;

        let mut email = user.email;
        let mut email_verified = email.as_deref().is_some_and(|value| !value.is_empty());
        if !email_verified {
            // Private-email accounts don't return it on /user: look it up separately.
            let emails_response = self
                .http
                .get(&self.endpoints.emails_url)
                .header(AUTHORIZATION, &authorization)
                .send()
                .await
                .map_err(DomainError::internal)?;
            if emails_response.status().is_success() {
                let emails: Vec<Email> =
                    emails_response.json().await.map_err(DomainError::internal)?;
                let chosen = emails.iter().find(|entry| entry.primary).or(emails.first());
                if let Some(primary) = chosen {
                    email = Some(primary.email.clone());
                    email_verified = primary.verified;
                }
            }
        }

        Ok(OAuthProfile {
            provider_account_id: user.id.to_string(),
            email,
            email_verified,
            name: user.name,
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

    /// A stand-in for GitHub's token, user and emails endpoints that records
    /// what it was sent.
    #[derive(Clone)]
    struct Stub {
        token: (StatusCode, Value),
        user: (StatusCode, Value),
        emails: (StatusCode, Value),
        token_forms: Arc<Mutex<Vec<HashMap<String, String>>>>,
        token_accepts: Arc<Mutex<Vec<String>>>,
        /// `"{path} {authorization} {user-agent}"` per API call, in order.
        api_calls: Arc<Mutex<Vec<String>>>,
    }

    impl Stub {
        fn new(token: Value, user: Value) -> Self {
            Self {
                token: (StatusCode::OK, token),
                user: (StatusCode::OK, user),
                emails: (StatusCode::OK, json!([])),
                token_forms: Arc::default(),
                token_accepts: Arc::default(),
                api_calls: Arc::default(),
            }
        }

        fn record(&self, path: &str, headers: &HeaderMap) {
            self.api_calls.lock().unwrap().push(format!(
                "{path} {} {}",
                headers["authorization"].to_str().unwrap(),
                headers["user-agent"].to_str().unwrap()
            ));
        }

        async fn provider(&self) -> GitHubOAuthProvider {
            self.provider_with("client-id", "client-secret").await
        }

        async fn provider_with(&self, id: &str, secret: &str) -> GitHubOAuthProvider {
            let router = Router::new()
                .route(
                    "/token",
                    post(
                        |State(stub): State<Stub>,
                         headers: HeaderMap,
                         Form(form): Form<HashMap<String, String>>| async move {
                            stub.token_forms.lock().unwrap().push(form);
                            stub.token_accepts
                                .lock()
                                .unwrap()
                                .push(headers["accept"].to_str().unwrap().to_string());
                            (stub.token.0, Json(stub.token.1.clone()))
                        },
                    ),
                )
                .route(
                    "/user",
                    get(|State(stub): State<Stub>, headers: HeaderMap| async move {
                        stub.record("/user", &headers);
                        (stub.user.0, Json(stub.user.1.clone()))
                    }),
                )
                .route(
                    "/user/emails",
                    get(|State(stub): State<Stub>, headers: HeaderMap| async move {
                        stub.record("/user/emails", &headers);
                        (stub.emails.0, Json(stub.emails.1.clone()))
                    }),
                )
                .with_state(self.clone());
            let base = serve(router).await;
            GitHubOAuthProvider::new(
                id,
                secret,
                GitHubOAuthEndpoints {
                    authorization_url: format!("{base}/authorize"),
                    token_url: format!("{base}/token"),
                    user_url: format!("{base}/user"),
                    emails_url: format!("{base}/user/emails"),
                },
                oauth_http_client().unwrap(),
            )
        }

        fn calls(&self) -> Vec<String> {
            self.api_calls.lock().unwrap().clone()
        }
    }

    async fn exchange(stub: &Stub) -> DomainResult<OAuthProfile> {
        stub.provider()
            .await
            .exchange_code_for_profile("auth-code", "https://api/cb", "my-verifier")
            .await
    }

    /// Output of `GitHubOAuthProvider.getAuthorizationUrl('st.ate_1-2',
    /// 'https://api.example.com/auth/oauth/github/callback', 'chal_lenge-1')`
    /// in `apps/api`, run under `tsx` with
    /// `GITHUB_OAUTH_CLIENT_ID=Iv1.github-client`.
    #[test]
    fn builds_the_authorization_url_apps_api_builds() {
        let provider = GitHubOAuthProvider::new(
            "Iv1.github-client",
            "client-secret-not-real",
            GitHubOAuthEndpoints::default(),
            oauth_http_client().unwrap(),
        );

        let url = provider.get_authorization_url(
            "st.ate_1-2",
            "https://api.example.com/auth/oauth/github/callback",
            "chal_lenge-1",
        );

        assert_eq!(
            url,
            "https://github.com/login/oauth/authorize?client_id=Iv1.github-client&redirect_uri=https%3A%2F%2Fapi.example.com%2Fauth%2Foauth%2Fgithub%2Fcallback&scope=read%3Auser+user%3Aemail&state=st.ate_1-2&code_challenge=chal_lenge-1&code_challenge_method=S256"
        );
    }

    #[tokio::test]
    async fn uses_the_public_email_from_user_when_present() {
        let stub = Stub::new(
            json!({ "access_token": "tok" }),
            json!({ "id": 42, "name": "Jeff Man", "email": "jeff@example.com" }),
        );

        let profile = exchange(&stub).await.unwrap();

        assert_eq!(
            profile,
            OAuthProfile {
                provider_account_id: "42".to_string(),
                email: Some("jeff@example.com".to_string()),
                email_verified: true,
                name: Some("Jeff Man".to_string()),
            }
        );
        assert_eq!(stub.calls(), vec!["/user Bearer tok trakwyn-api"]);
    }

    #[tokio::test]
    async fn sends_the_code_verifier_and_asks_for_json() {
        let stub =
            Stub::new(json!({ "access_token": "tok" }), json!({ "id": 1, "email": "a@b.c" }));

        exchange(&stub).await.unwrap();

        let expected: HashMap<String, String> = [
            ("client_id", "client-id"),
            ("client_secret", "client-secret"),
            ("code", "auth-code"),
            ("redirect_uri", "https://api/cb"),
            ("code_verifier", "my-verifier"),
        ]
        .into_iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect();
        assert_eq!(*stub.token_forms.lock().unwrap(), vec![expected]);
        assert_eq!(*stub.token_accepts.lock().unwrap(), vec!["application/json"]);
    }

    #[tokio::test]
    async fn falls_back_to_user_emails_when_the_primary_email_is_private() {
        let mut stub = Stub::new(
            json!({ "access_token": "tok" }),
            json!({ "id": 42, "name": "Jeff Man", "email": null }),
        );
        stub.emails.1 = json!([
            { "email": "secondary@example.com", "primary": false, "verified": true },
            { "email": "primary@example.com", "primary": true, "verified": true },
        ]);

        let profile = exchange(&stub).await.unwrap();

        assert_eq!(profile.email.as_deref(), Some("primary@example.com"));
        assert!(profile.email_verified);
        assert_eq!(
            stub.calls(),
            vec!["/user Bearer tok trakwyn-api", "/user/emails Bearer tok trakwyn-api"]
        );
    }

    #[tokio::test]
    async fn takes_the_first_address_when_none_is_primary_with_its_own_verified_flag() {
        let mut stub =
            Stub::new(json!({ "access_token": "tok" }), json!({ "id": 42, "name": null }));
        stub.emails.1 = json!([
            { "email": "first@example.com", "primary": false, "verified": false },
            { "email": "second@example.com", "primary": false, "verified": true },
        ]);

        let profile = exchange(&stub).await.unwrap();

        assert_eq!(profile.email.as_deref(), Some("first@example.com"));
        assert!(!profile.email_verified);
        assert_eq!(profile.name, None);
    }

    #[tokio::test]
    async fn has_no_email_when_the_lookup_fails_or_is_empty() {
        let mut stub =
            Stub::new(json!({ "access_token": "tok" }), json!({ "id": 42, "email": null }));
        let profile = exchange(&stub).await.unwrap();
        assert_eq!(profile.email, None);
        assert!(!profile.email_verified);

        stub.emails = (StatusCode::FORBIDDEN, json!({ "message": "nope" }));
        let profile = exchange(&stub).await.unwrap();
        assert_eq!(profile.email, None);
        assert!(!profile.email_verified);
    }

    #[tokio::test]
    async fn fails_when_the_token_exchange_returns_no_access_token() {
        let stub = Stub::new(json!({ "error": "bad_verification_code" }), json!({}));
        let err = exchange(&stub).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::InternalError);
        assert!(err.to_string().contains("GitHub token exchange failed: bad_verification_code"));

        let stub = Stub::new(json!({}), json!({}));
        let err = exchange(&stub).await.unwrap_err();
        assert!(err.to_string().contains("GitHub token exchange failed: no access_token"));
        assert!(stub.calls().is_empty());
    }

    #[tokio::test]
    async fn fails_when_the_token_exchange_answers_with_an_error_status() {
        let mut stub = Stub::new(json!({}), json!({}));
        stub.token.0 = StatusCode::BAD_GATEWAY;

        let err = exchange(&stub).await.unwrap_err();
        assert!(err.to_string().contains("GitHub token exchange failed: 502"));
    }

    #[tokio::test]
    async fn fails_when_the_user_fetch_fails() {
        let mut stub = Stub::new(json!({ "access_token": "tok" }), json!({}));
        stub.user.0 = StatusCode::UNAUTHORIZED;

        let err = exchange(&stub).await.unwrap_err();
        assert!(err.to_string().contains("GitHub user fetch failed: 401"));
    }

    #[tokio::test]
    async fn fails_when_client_credentials_are_not_configured() {
        let stub = Stub::new(json!({ "access_token": "tok" }), json!({ "id": 1 }));

        for (id, secret) in [("", "client-secret"), ("client-id", "")] {
            let err = stub
                .provider_with(id, secret)
                .await
                .exchange_code_for_profile("code", "https://api/cb", "my-verifier")
                .await
                .unwrap_err();
            assert!(err
                .to_string()
                .contains("GITHUB_OAUTH_CLIENT_ID/GITHUB_OAUTH_CLIENT_SECRET not set"));
        }
        assert!(stub.token_forms.lock().unwrap().is_empty());
    }
}
