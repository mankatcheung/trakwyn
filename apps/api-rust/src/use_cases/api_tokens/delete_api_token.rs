use std::sync::Arc;

use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::ApiTokenRepository;

pub struct DeleteApiTokenUseCase {
    pub api_token_repository: Arc<dyn ApiTokenRepository>,
}

impl DeleteApiTokenUseCase {
    pub async fn execute(&self, id: &str, user_id: &str) -> DomainResult<()> {
        if self.api_token_repository.find_by_id_and_user_id(id, user_id).await?.is_none() {
            return Err(DomainError::not_found("API token not found"));
        }
        self.api_token_repository.delete(id).await
    }
}
