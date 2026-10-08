use std::sync::Arc;

use chrono::{DateTime, Utc};

use crate::domain::security_event::SecurityEventType;
use crate::use_cases::clock::now;
use crate::use_cases::constants::mcp_oauth;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ids::GenerateId;
use crate::use_cases::mcp_oauth::{
    CreateMcpOAuthAccessTokenInput, CreateMcpOAuthAccessTokenUseCase,
    CreateMcpOAuthRefreshTokenInput, CreateMcpOAuthRefreshTokenUseCase,
};
use crate::use_cases::ports::{
    CreateSecurityEventData, McpOAuthRefreshTokenRepository, McpOAuthTokenRepository,
    SecurityEventRepository,
};
use crate::use_cases::secret_token;

pub struct RotateMcpOAuthRefreshTokenInput {
    pub refresh_token: String,
    pub client_id: String,
}

#[derive(Debug)]
pub struct RotateMcpOAuthRefreshTokenOutput {
    pub user_id: String,
    pub access_token: String,
    pub refresh_token: String,
    pub access_token_expires_at: DateTime<Utc>,
}

pub struct RotateMcpOAuthRefreshTokenUseCase {
    pub mcp_oauth_refresh_token_repository: Arc<dyn McpOAuthRefreshTokenRepository>,
    pub mcp_oauth_token_repository: Arc<dyn McpOAuthTokenRepository>,
    pub create_mcp_oauth_access_token_use_case: CreateMcpOAuthAccessTokenUseCase,
    pub create_mcp_oauth_refresh_token_use_case: CreateMcpOAuthRefreshTokenUseCase,
    pub security_event_repository: Arc<dyn SecurityEventRepository>,
    pub generate_id: GenerateId,
}

impl RotateMcpOAuthRefreshTokenUseCase {
    /// `None` is every refusal (the endpoint answers `invalid_grant`).
    pub async fn execute(
        &self,
        input: RotateMcpOAuthRefreshTokenInput,
    ) -> DomainResult<Option<RotateMcpOAuthRefreshTokenOutput>> {
        if !input.refresh_token.starts_with(mcp_oauth::REFRESH_TOKEN_PREFIX) {
            return Ok(None);
        }
        let token = self
            .mcp_oauth_refresh_token_repository
            .find_by_token_hash(&secret_token::hash(&input.refresh_token))
            .await?;
        let Some(token) = token else {
            return Ok(None);
        };
        if token.client_id != input.client_id {
            return Ok(None);
        }

        let now = now();
        if token.revoked_at.is_some() || token.expires_at <= now {
            return Ok(None);
        }
        if token.used_at.is_some() {
            self.burn_family(&token.family_id, &token.user_id, now).await?;
            return Ok(None);
        }

        if !self.mcp_oauth_refresh_token_repository.mark_used(&token.id, now).await? {
            self.burn_family(&token.family_id, &token.user_id, now).await?;
            return Ok(None);
        }

        let access_token = self
            .create_mcp_oauth_access_token_use_case
            .execute(CreateMcpOAuthAccessTokenInput {
                user_id: token.user_id.clone(),
                client_id: token.client_id.clone(),
                family_id: token.family_id.clone(),
                scope: token.scope,
            })
            .await?;
        let refresh_token = self
            .create_mcp_oauth_refresh_token_use_case
            .execute(CreateMcpOAuthRefreshTokenInput {
                user_id: token.user_id.clone(),
                client_id: token.client_id,
                scope: token.scope,
                family_id: token.family_id,
            })
            .await?;
        Ok(Some(RotateMcpOAuthRefreshTokenOutput {
            user_id: token.user_id,
            access_token: access_token.raw_token,
            refresh_token: refresh_token.raw_token,
            access_token_expires_at: access_token.token.expires_at,
        }))
    }

    /// Reuse means the family is compromised, so every credential descended
    /// from that one consent goes: refresh tokens *and* the access tokens
    /// already issued from them.
    async fn burn_family(
        &self,
        family_id: &str,
        user_id: &str,
        now: DateTime<Utc>,
    ) -> DomainResult<()> {
        self.mcp_oauth_refresh_token_repository.revoke_family(family_id, now).await?;
        self.mcp_oauth_token_repository.revoke_family(family_id, now).await?;
        self.security_event_repository
            .create(CreateSecurityEventData {
                id: (self.generate_id)(),
                user_id: user_id.to_string(),
                event_type: SecurityEventType::McpOauthRefreshReuseDetected,
                ip_address: None,
                user_agent: None,
            })
            .await?;
        Ok(())
    }
}
