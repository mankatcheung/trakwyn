use std::sync::Arc;

use chrono::TimeDelta;

use crate::domain::mcp_oauth::{
    McpOAuthAuthorizationCode, McpOAuthCodeChallengeMethod, McpOAuthScope,
};
use crate::use_cases::clock::now;
use crate::use_cases::constants::mcp_oauth;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{
    CreateMcpOAuthAuthorizationCodeData, McpOAuthAuthorizationCodeRepository,
};
use crate::use_cases::secret_token;

pub struct CreateMcpOAuthAuthorizationCodeInput {
    pub client_id: String,
    pub user_id: String,
    pub redirect_uri: String,
    pub scope: McpOAuthScope,
    pub code_challenge: String,
}

#[derive(Debug)]
pub struct CreateMcpOAuthAuthorizationCodeOutput {
    pub code: McpOAuthAuthorizationCode,
    pub raw_code: String,
}

pub struct CreateMcpOAuthAuthorizationCodeUseCase {
    pub mcp_oauth_authorization_code_repository: Arc<dyn McpOAuthAuthorizationCodeRepository>,
    pub generate_id: GenerateId,
}

impl CreateMcpOAuthAuthorizationCodeUseCase {
    pub async fn execute(
        &self,
        input: CreateMcpOAuthAuthorizationCodeInput,
    ) -> DomainResult<CreateMcpOAuthAuthorizationCodeOutput> {
        let raw_code = secret_token::generate(
            mcp_oauth::AUTHORIZATION_CODE_PREFIX,
            mcp_oauth::AUTHORIZATION_CODE_RANDOM_BYTES,
        )?;
        let code = self
            .mcp_oauth_authorization_code_repository
            .create(CreateMcpOAuthAuthorizationCodeData {
                id: (self.generate_id)(),
                code_hash: secret_token::hash(&raw_code),
                // The grant id is minted here, with the user's consent, and
                // inherited by every token descended from this code, so one
                // revocation reaches all of them and a replayed code can
                // revoke what the first use produced.
                family_id: (self.generate_id)(),
                client_id: input.client_id,
                user_id: input.user_id,
                redirect_uri: input.redirect_uri,
                scope: input.scope,
                code_challenge: input.code_challenge,
                code_challenge_method: McpOAuthCodeChallengeMethod::S256,
                expires_at: now() + TimeDelta::milliseconds(mcp_oauth::AUTHORIZATION_CODE_TTL_MS),
            })
            .await?;
        Ok(CreateMcpOAuthAuthorizationCodeOutput { code, raw_code })
    }
}
