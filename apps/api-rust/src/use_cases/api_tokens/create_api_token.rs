use std::sync::Arc;

use crate::domain::api_token::{ApiToken, ApiTokenScope};
use crate::use_cases::constants::{api_token, defaults};
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{ApiTokenRepository, CreateApiTokenData};
use crate::use_cases::secret_token;

pub struct CreateApiTokenInput {
    pub user_id: String,
    pub name: String,
    /// `None` stores the default scope.
    pub scope: Option<ApiTokenScope>,
}

#[derive(Debug)]
pub struct CreateApiTokenOutput {
    pub token: ApiToken,
    /// The secret itself. Returned here once and never again: only its hash
    /// is stored.
    pub raw_token: String,
}

pub struct CreateApiTokenUseCase {
    pub api_token_repository: Arc<dyn ApiTokenRepository>,
    pub generate_id: GenerateId,
}

impl CreateApiTokenUseCase {
    pub async fn execute(&self, input: CreateApiTokenInput) -> DomainResult<CreateApiTokenOutput> {
        let raw_token = secret_token::generate(api_token::PREFIX, api_token::RANDOM_BYTES)?;
        let token_hash = secret_token::hash(&raw_token);

        let token = self
            .api_token_repository
            .create(CreateApiTokenData {
                id: (self.generate_id)(),
                user_id: input.user_id,
                name: input.name,
                token_hash,
                scope: input.scope.unwrap_or(defaults::API_TOKEN_SCOPE),
            })
            .await?;

        Ok(CreateApiTokenOutput { token, raw_token })
    }
}
