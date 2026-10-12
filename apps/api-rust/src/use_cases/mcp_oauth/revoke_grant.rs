use std::sync::Arc;

use crate::use_cases::clock::now;
use crate::use_cases::constants::mcp_oauth;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{McpOAuthRefreshTokenRepository, McpOAuthTokenRepository};
use crate::use_cases::secret_token;

/// RFC 7009 token revocation.
///
/// Accepts either credential type: a client holding only a refresh token must
/// be able to hand it back. Revocation is always grant-wide, in both
/// directions, so a client cannot refresh its way back in.
///
/// Returns the owning user id so the caller can record a security event, or
/// `None` if the credential is unknown; the endpoint answers 200 either way,
/// so it cannot be used to probe which tokens exist.
pub struct RevokeMcpOAuthGrantUseCase {
    pub mcp_oauth_token_repository: Arc<dyn McpOAuthTokenRepository>,
    pub mcp_oauth_refresh_token_repository: Arc<dyn McpOAuthRefreshTokenRepository>,
}

impl RevokeMcpOAuthGrantUseCase {
    pub async fn execute(&self, raw_token: &str) -> DomainResult<Option<String>> {
        let Some((family_id, user_id)) = self.find_grant(raw_token).await? else {
            return Ok(None);
        };

        let now = now();
        self.mcp_oauth_token_repository.revoke_family(&family_id, now).await?;
        self.mcp_oauth_refresh_token_repository.revoke_family(&family_id, now).await?;
        Ok(Some(user_id))
    }

    /// Order matters: `ACCESS_TOKEN_PREFIX` (`trakwyn_mcp_`) is a prefix of
    /// `REFRESH_TOKEN_PREFIX` (`trakwyn_mcp_refresh_`), so the longer one is
    /// tested first or every refresh token is misread as an access token.
    async fn find_grant(&self, raw_token: &str) -> DomainResult<Option<(String, String)>> {
        let hash = secret_token::hash(raw_token);
        if raw_token.starts_with(mcp_oauth::REFRESH_TOKEN_PREFIX) {
            let token = self.mcp_oauth_refresh_token_repository.find_by_token_hash(&hash).await?;
            return Ok(token.map(|token| (token.family_id, token.user_id)));
        }
        if raw_token.starts_with(mcp_oauth::ACCESS_TOKEN_PREFIX) {
            let token = self.mcp_oauth_token_repository.find_by_token_hash(&hash).await?;
            return Ok(token.map(|token| (token.family_id, token.user_id)));
        }
        Ok(None)
    }
}
