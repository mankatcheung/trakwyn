use std::sync::Arc;

use crate::domain::session::Session;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::SessionRepository;

pub struct ListSessionsUseCase {
    pub session_repository: Arc<dyn SessionRepository>,
}

impl ListSessionsUseCase {
    pub async fn execute(&self, user_id: &str) -> DomainResult<Vec<Session>> {
        self.session_repository.find_active_by_user_id(user_id).await
    }
}
