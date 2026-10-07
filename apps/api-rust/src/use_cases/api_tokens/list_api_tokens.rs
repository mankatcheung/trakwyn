use std::sync::Arc;

use crate::domain::api_token::ApiToken;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::ApiTokenRepository;

pub struct ListApiTokensUseCase {
    pub api_token_repository: Arc<dyn ApiTokenRepository>,
}

impl ListApiTokensUseCase {
    pub async fn execute(&self, user_id: &str) -> DomainResult<Vec<ApiToken>> {
        self.api_token_repository.find_all_by_user_id(user_id).await
    }
}
