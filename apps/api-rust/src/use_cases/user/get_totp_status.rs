use std::sync::Arc;

use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::UserRepository;

pub struct GetTotpStatusUseCase {
    pub user_repository: Arc<dyn UserRepository>,
}

impl GetTotpStatusUseCase {
    pub async fn execute(&self, user_id: &str) -> DomainResult<bool> {
        let user = self
            .user_repository
            .find_by_id(user_id)
            .await?
            .ok_or_else(|| DomainError::not_found("User not found"))?;
        Ok(user.totp_enabled)
    }
}
