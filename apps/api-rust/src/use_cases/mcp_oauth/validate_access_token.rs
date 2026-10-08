use std::sync::Arc;

use crate::domain::mcp_oauth::McpOAuthScope;
use crate::use_cases::clock::now;
use crate::use_cases::constants::mcp_oauth;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::McpOAuthTokenRepository;
use crate::use_cases::secret_token;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidateMcpOAuthAccessTokenResult {
    pub sub: String,
    pub scope: McpOAuthScope,
}

pub struct ValidateMcpOAuthAccessTokenUseCase {
    pub mcp_oauth_token_repository: Arc<dyn McpOAuthTokenRepository>,
}

impl ValidateMcpOAuthAccessTokenUseCase {
    pub async fn execute(
        &self,
        raw_token: &str,
    ) -> DomainResult<Option<ValidateMcpOAuthAccessTokenResult>> {
        if !raw_token.starts_with(mcp_oauth::ACCESS_TOKEN_PREFIX) {
            return Ok(None);
        }

        let Some(token) = self
            .mcp_oauth_token_repository
            .find_by_token_hash(&secret_token::hash(raw_token))
            .await?
        else {
            return Ok(None);
        };
        if token.audience != mcp_oauth::RESOURCE || token.revoked_at.is_some() {
            return Ok(None);
        }
        if token.expires_at <= now() {
            return Ok(None);
        }

        self.mcp_oauth_token_repository.update_last_used(&token.id).await?;
        Ok(Some(ValidateMcpOAuthAccessTokenResult { sub: token.user_id, scope: token.scope }))
    }
}
