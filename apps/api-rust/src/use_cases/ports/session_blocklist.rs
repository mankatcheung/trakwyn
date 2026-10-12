use async_trait::async_trait;

/// Revoked session ids, consulted on every authenticated request.
///
/// Access tokens are otherwise stateless, so one issued before a logout would
/// stay valid until its own 15-minute expiry. Recording the revoked `sid`
/// here lets `AuthenticateRequestUseCase` refuse it at once.
///
/// Implementations must **fail open**: a backing-store failure means "not
/// revoked". A Redis blip should degrade to "logout takes up to 15 minutes",
/// never to "every request is unauthenticated". That is why neither method
/// returns a `Result`.
#[async_trait]
pub trait SessionBlocklist: Send + Sync {
    /// Blocklists `session_id` for the remaining lifetime of any access token it issued.
    async fn revoke(&self, session_id: &str);
    /// False both when the session is not revoked and when the check itself failed.
    async fn is_revoked(&self, session_id: &str) -> bool;
}
