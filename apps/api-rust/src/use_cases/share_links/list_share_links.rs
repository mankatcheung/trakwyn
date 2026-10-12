use std::sync::Arc;

use crate::domain::share_link::ShareLink;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::ShareLinkRepository;

pub struct ListShareLinksUseCase {
    pub share_link_repository: Arc<dyn ShareLinkRepository>,
}

impl ListShareLinksUseCase {
    pub async fn execute(&self, user_id: &str) -> DomainResult<Vec<ShareLink>> {
        self.share_link_repository.find_all_by_user_id(user_id).await
    }
}
