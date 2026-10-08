use std::sync::Arc;

use chrono::TimeDelta;

use crate::domain::mcp_oauth::{McpOAuthAccessToken, McpOAuthScope};
use crate::use_cases::clock::now;
use crate::use_cases::constants::mcp_oauth;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{CreateMcpOAuthAccessTokenData, McpOAuthTokenRepository};
use crate::use_cases::secret_token;

pub struct CreateMcpOAuthAccessTokenInput {
    pub user_id: String,
    pub client_id: String,
    /// The grant this token belongs to; see `McpOAuthAccessToken::family_id`.
    pub family_id: String,
    pub scope: McpOAuthScope,
}

#[derive(Debug)]
pub struct CreateMcpOAuthAccessTokenOutput {
    pub token: McpOAuthAccessToken,
    pub raw_token: String,
}

pub struct CreateMcpOAuthAccessTokenUseCase {
    pub mcp_oauth_token_repository: Arc<dyn McpOAuthTokenRepository>,
    pub generate_id: GenerateId,
}

impl CreateMcpOAuthAccessTokenUseCase {
    pub async fn execute(
        &self,
        input: CreateMcpOAuthAccessTokenInput,
    ) -> DomainResult<CreateMcpOAuthAccessTokenOutput> {
        let raw_token = secret_token::generate(
            mcp_oauth::ACCESS_TOKEN_PREFIX,
            mcp_oauth::ACCESS_TOKEN_RANDOM_BYTES,
        )?;
        let token = self
            .mcp_oauth_token_repository
            .create(CreateMcpOAuthAccessTokenData {
                id: (self.generate_id)(),
                user_id: input.user_id,
                client_id: input.client_id,
                family_id: input.family_id,
                token_hash: secret_token::hash(&raw_token),
                scope: input.scope,
                audience: mcp_oauth::RESOURCE.to_string(),
                expires_at: now() + TimeDelta::milliseconds(mcp_oauth::ACCESS_TOKEN_TTL_MS),
            })
            .await?;
        Ok(CreateMcpOAuthAccessTokenOutput { token, raw_token })
    }
}
