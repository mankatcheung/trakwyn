use std::sync::Arc;

use chrono::TimeDelta;

use crate::domain::mcp_oauth::{McpOAuthRefreshToken, McpOAuthScope};
use crate::use_cases::clock::now;
use crate::use_cases::constants::mcp_oauth;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{CreateMcpOAuthRefreshTokenData, McpOAuthRefreshTokenRepository};
use crate::use_cases::secret_token;

pub struct CreateMcpOAuthRefreshTokenInput {
    pub user_id: String,
    pub client_id: String,
    pub scope: McpOAuthScope,
    /// The grant this token belongs to. Required: the grant id is minted with
    /// the authorization code, never here, so a refresh token can never start
    /// a family that its own access tokens are not part of.
    pub family_id: String,
}

#[derive(Debug)]
pub struct CreateMcpOAuthRefreshTokenOutput {
    pub token: McpOAuthRefreshToken,
    pub raw_token: String,
}

pub struct CreateMcpOAuthRefreshTokenUseCase {
    pub mcp_oauth_refresh_token_repository: Arc<dyn McpOAuthRefreshTokenRepository>,
    pub generate_id: GenerateId,
}

impl CreateMcpOAuthRefreshTokenUseCase {
    pub async fn execute(
        &self,
        input: CreateMcpOAuthRefreshTokenInput,
    ) -> DomainResult<CreateMcpOAuthRefreshTokenOutput> {
        let raw_token = secret_token::generate(
            mcp_oauth::REFRESH_TOKEN_PREFIX,
            mcp_oauth::REFRESH_TOKEN_RANDOM_BYTES,
        )?;
        let token = self
            .mcp_oauth_refresh_token_repository
            .create(CreateMcpOAuthRefreshTokenData {
                id: (self.generate_id)(),
                token_hash: secret_token::hash(&raw_token),
                family_id: input.family_id,
                client_id: input.client_id,
                user_id: input.user_id,
                scope: input.scope,
                expires_at: now() + TimeDelta::milliseconds(mcp_oauth::REFRESH_TOKEN_TTL_MS),
            })
            .await?;
        Ok(CreateMcpOAuthRefreshTokenOutput { token, raw_token })
    }
}
