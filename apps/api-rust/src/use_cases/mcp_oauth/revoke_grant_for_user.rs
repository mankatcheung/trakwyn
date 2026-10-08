use std::sync::Arc;

use crate::domain::security_event::SecurityEventType;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{
    CreateSecurityEventData, McpOAuthGrantRepository, McpOAuthRefreshTokenRepository,
    McpOAuthTokenRepository, SecurityEventRepository,
};

/// Revocation initiated by the user rather than by the client ("I don't want
/// this thing reading my applications any more").
///
/// Distinct from `RevokeMcpOAuthGrantUseCase`, which is the RFC 7009 endpoint
/// and authenticates by possession of the token. Here the caller holds a
/// session, not a token, so ownership is established explicitly.
///
/// Returns false for a grant that is not this user's, or is already gone,
/// without distinguishing between the two.
pub struct RevokeMcpOAuthGrantForUserUseCase {
    pub mcp_oauth_grant_repository: Arc<dyn McpOAuthGrantRepository>,
    pub mcp_oauth_token_repository: Arc<dyn McpOAuthTokenRepository>,
    pub mcp_oauth_refresh_token_repository: Arc<dyn McpOAuthRefreshTokenRepository>,
    pub security_event_repository: Arc<dyn SecurityEventRepository>,
    pub generate_id: GenerateId,
}

impl RevokeMcpOAuthGrantForUserUseCase {
    pub async fn execute(&self, user_id: &str, grant_id: &str) -> DomainResult<bool> {
        let now = now();
        let grants = self.mcp_oauth_grant_repository.find_active_by_user_id(user_id, now).await?;
        if !grants.iter().any(|grant| grant.id == grant_id) {
            return Ok(false);
        }

        self.mcp_oauth_token_repository.revoke_family(grant_id, now).await?;
        self.mcp_oauth_refresh_token_repository.revoke_family(grant_id, now).await?;
        self.security_event_repository
            .create(CreateSecurityEventData {
                id: (self.generate_id)(),
                user_id: user_id.to_string(),
                // Deliberately the same event type the client-initiated path
                // records: the audit trail is about the grant ending, not
                // about who ended it.
                event_type: SecurityEventType::McpOauthTokenRevoked,
                ip_address: None,
                user_agent: None,
            })
            .await?;
        Ok(true)
    }
}
