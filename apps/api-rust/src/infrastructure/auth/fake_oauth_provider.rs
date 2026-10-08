use async_trait::async_trait;
use serde::Deserialize;

use crate::domain::oauth_account::OAuthProviderName;
use crate::infrastructure::auth::encoding::decode_base64_lenient;
use crate::infrastructure::auth::oauth_http::authorization_url;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::oauth_provider::{OAuthProfile, OAuthProvider};

/// Path of the stand-in consent screen. Declared here, with the provider that
/// redirects to it, rather than in the HTTP route table: this is
/// infrastructure and must not import `http`. The route the server registers
/// (only when `OAUTH_PROVIDER_MODE=fake`) re-exports this value, so the two
/// cannot drift apart.
pub const FAKE_OAUTH_CONSENT_PATH: &str = "/auth/oauth/fake-provider/authorize";

/// The profile the consent route encoded into the code, as `apps/api` writes it.
#[derive(Deserialize)]
struct EncodedProfile {
    #[serde(rename = "providerAccountId")]
    provider_account_id: String,
    email: Option<String>,
    #[serde(rename = "emailVerified")]
    email_verified: bool,
    name: Option<String>,
}

/// A same-origin stand-in for Google/GitHub, selected by
/// `OAUTH_PROVIDER_MODE=fake`. `get_authorization_url` points at this server's
/// own fake consent route instead of a real provider, so e2e tests can drive
/// the whole browser round trip (real redirect, real PKCE/state cookie, real
/// callback handler) without a live Google/GitHub dependency or secrets in CI.
///
/// `exchange_code_for_profile` decodes the profile the consent route encoded
/// into the code itself, so no state needs to be shared between the two
/// requests, and makes no network call at all.
pub struct FakeOAuthProvider {
    provider: OAuthProviderName,
}

impl FakeOAuthProvider {
    pub fn new(provider: OAuthProviderName) -> Self {
        Self { provider }
    }
}

#[async_trait]
impl OAuthProvider for FakeOAuthProvider {
    // `redirect_uri` and `code_challenge` are part of the port's contract but
    // unused here: the fake consent route derives its own redirect_uri, and
    // there is no real token exchange for a challenge to protect.
    fn get_authorization_url(
        &self,
        state: &str,
        _redirect_uri: &str,
        _code_challenge: &str,
    ) -> String {
        authorization_url(
            FAKE_OAUTH_CONSENT_PATH,
            &[("provider", self.provider.as_str()), ("state", state)],
        )
    }

    async fn exchange_code_for_profile(
        &self,
        code: &str,
        _redirect_uri: &str,
        _code_verifier: &str,
    ) -> DomainResult<OAuthProfile> {
        let profile: EncodedProfile =
            serde_json::from_slice(&decode_base64_lenient(code)).map_err(DomainError::internal)?;
        Ok(OAuthProfile {
            provider_account_id: profile.provider_account_id,
            email: profile.email,
            email_verified: profile.email_verified,
            name: profile.name,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::auth::encoding::base64url;
    use crate::use_cases::errors::ErrorCode;

    #[test]
    fn points_at_the_fake_consent_route_carrying_the_provider_name_and_state() {
        let url = FakeOAuthProvider::new(OAuthProviderName::Google).get_authorization_url(
            "my-state",
            "https://api/cb",
            "my-challenge",
        );
        assert_eq!(url, "/auth/oauth/fake-provider/authorize?provider=google&state=my-state");
    }

    #[test]
    fn names_the_right_provider_for_github() {
        let url = FakeOAuthProvider::new(OAuthProviderName::Github).get_authorization_url(
            "s",
            "https://api/cb",
            "c",
        );
        assert_eq!(url, "/auth/oauth/fake-provider/authorize?provider=github&state=s");
    }

    /// Output of `FakeGoogleOAuthProvider.getAuthorizationUrl("a b&c=d/é~*'()!",
    /// 'x', 'y')` in `apps/api`, run under `tsx`.
    #[test]
    fn encodes_the_state_the_way_apps_api_does() {
        let url = FakeOAuthProvider::new(OAuthProviderName::Google).get_authorization_url(
            "a b&c=d/é~*'()!",
            "x",
            "y",
        );
        assert_eq!(
            url,
            "/auth/oauth/fake-provider/authorize?provider=google&state=a+b%26c%3Dd%2F%C3%A9%7E*%27%28%29%21"
        );
    }

    #[tokio::test]
    async fn decodes_the_profile_the_consent_route_encoded_into_the_code() {
        // What the consent route does: base64url of the JSON profile.
        let code = base64url(
            r#"{"providerAccountId":"fake-google-jeff@example.com","email":"jeff@example.com","emailVerified":true,"name":"Jeff Man"}"#,
        );

        let profile = FakeOAuthProvider::new(OAuthProviderName::Google)
            .exchange_code_for_profile(&code, "https://api/cb", "verifier-unused-by-the-fake")
            .await
            .unwrap();

        assert_eq!(
            profile,
            OAuthProfile {
                provider_account_id: "fake-google-jeff@example.com".to_string(),
                email: Some("jeff@example.com".to_string()),
                email_verified: true,
                name: Some("Jeff Man".to_string()),
            }
        );
    }

    #[tokio::test]
    async fn decodes_a_profile_with_no_email_or_name() {
        let code = base64url(
            r#"{"providerAccountId":"fake-github-1","email":null,"emailVerified":false,"name":null}"#,
        );

        let profile = FakeOAuthProvider::new(OAuthProviderName::Github)
            .exchange_code_for_profile(&code, "", "")
            .await
            .unwrap();

        assert_eq!(profile.email, None);
        assert_eq!(profile.name, None);
        assert!(!profile.email_verified);
    }

    #[tokio::test]
    async fn fails_on_a_code_that_is_not_an_encoded_profile() {
        let err = FakeOAuthProvider::new(OAuthProviderName::Google)
            .exchange_code_for_profile("not-a-profile", "", "")
            .await
            .unwrap_err();
        assert_eq!(err.code(), ErrorCode::InternalError);
    }
}
