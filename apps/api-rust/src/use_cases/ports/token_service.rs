use crate::use_cases::errors::DomainResult;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TokenPair {
    pub access_token: String,
    pub refresh_token: String,
}

/// What a verified access token asserts.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccessClaims {
    pub sub: String,
    pub email: String,
    /// Session id. Absent on a token that predates session tracking.
    pub sid: Option<String>,
    /// Epoch-ms of the session's last full authentication (login or step-up).
    pub auth_time: Option<i64>,
}

/// What a verified refresh token asserts.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RefreshClaims {
    pub sub: String,
    pub email: String,
    pub sid: String,
    /// The refresh token's own id; absent on a token that predates rotation tracking.
    pub jti: Option<String>,
    pub auth_time: Option<i64>,
}

pub trait TokenService: Send + Sync {
    fn sign(
        &self,
        user_id: &str,
        email: &str,
        session_id: &str,
        refresh_token_id: &str,
        auth_time_ms: i64,
    ) -> DomainResult<TokenPair>;

    /// `None` for a token that is malformed, forged or expired.
    fn verify_access(&self, token: &str) -> Option<AccessClaims>;

    /// Fails with `Unauthorized` for a token that is malformed, forged or expired.
    fn verify_refresh(&self, token: &str) -> DomainResult<RefreshClaims>;
}
