use std::sync::Arc;

use crate::domain::api_token::ApiTokenScope;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::ApiTokenRepository;
use crate::use_cases::secret_token;

/// Who an API token acts as, and how much it may do.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidateApiTokenResult {
    pub sub: String,
    pub email: String,
    pub scope: ApiTokenScope,
}

pub struct ValidateApiTokenUseCase {
    pub api_token_repository: Arc<dyn ApiTokenRepository>,
}

impl ValidateApiTokenUseCase {
    /// `None` when no token has this hash. A hit records the use.
    pub async fn execute(&self, raw_token: &str) -> DomainResult<Option<ValidateApiTokenResult>> {
        let token_hash = secret_token::hash(raw_token);
        let Some(result) = self.api_token_repository.find_by_token_hash(&token_hash).await? else {
            return Ok(None);
        };

        self.api_token_repository.update_last_used(&result.token.id).await?;

        Ok(Some(ValidateApiTokenResult {
            sub: result.token.user_id,
            email: result.user_email,
            scope: result.token.scope,
        }))
    }
}
