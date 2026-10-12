use async_trait::async_trait;

/// The caller an OIDC ID token was verified to belong to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VerifiedOidcIdentity {
    pub email: String,
}

/// Verifies an OIDC ID token (signature, issuer, expiry and audience) and
/// reports whose it is. Used by the admin cron routes, which Cloud Scheduler
/// calls with a Google-signed token rather than a shared secret (JEF-336).
///
/// Resolves `None` for any token that does not verify, including when the
/// signing keys cannot be fetched: the caller's only decision is whether to
/// let the request through, and an unverifiable token is a "no".
#[async_trait]
pub trait OidcTokenVerifier: Send + Sync {
    async fn verify(&self, token: &str, audience: &str) -> Option<VerifiedOidcIdentity>;
}
