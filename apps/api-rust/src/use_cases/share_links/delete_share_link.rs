use std::sync::Arc;

use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::ShareLinkRepository;

pub struct DeleteShareLinkUseCase {
    pub share_link_repository: Arc<dyn ShareLinkRepository>,
}

impl DeleteShareLinkUseCase {
    pub async fn execute(&self, id: &str, user_id: &str) -> DomainResult<()> {
        if self.share_link_repository.find_by_id_and_user_id(id, user_id).await?.is_none() {
            return Err(DomainError::not_found("Share link not found"));
        }
        self.share_link_repository.delete(id).await
    }
}
