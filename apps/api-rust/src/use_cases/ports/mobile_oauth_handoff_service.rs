use crate::use_cases::errors::DomainResult;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MobileOAuthTokens {
    pub access_token: String,
    pub refresh_token: String,
}

/// Port over the mobile OAuth handoff service. The use case only ever redeems
/// a code, never mints one (that happens in the OAuth callback route, which is
/// allowed to reach infrastructure directly).
///
/// `code_verifier` is PKCE binding this redemption to whichever app instance
/// started the flow (JEF-275).
pub trait MobileOAuthHandoffService: Send + Sync {
    /// Fails for a code that is malformed, forged, expired or presented with
    /// the wrong verifier. The error is infrastructure detail; the use case
    /// replaces it with its own.
    fn verify(&self, code: &str, code_verifier: &str) -> DomainResult<MobileOAuthTokens>;
}
