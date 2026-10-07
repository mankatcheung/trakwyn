use async_trait::async_trait;

use crate::use_cases::errors::DomainResult;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OAuthProfile {
    pub provider_account_id: String,
    pub email: Option<String>,
    pub email_verified: bool,
    pub name: Option<String>,
}

#[async_trait]
pub trait OAuthProvider: Send + Sync {
    /// Builds the URL the browser is redirected to, to start the provider's
    /// consent flow. `code_challenge` is the SHA-256 of a verifier this server
    /// keeps: required rather than optional, so PKCE cannot be dropped by a
    /// caller simply not passing it (JEF-200).
    fn get_authorization_url(
        &self,
        state: &str,
        redirect_uri: &str,
        code_challenge: &str,
    ) -> String;

    /// Exchanges the callback's authorization code for the user's profile.
    async fn exchange_code_for_profile(
        &self,
        code: &str,
        redirect_uri: &str,
        code_verifier: &str,
    ) -> DomainResult<OAuthProfile>;
}
