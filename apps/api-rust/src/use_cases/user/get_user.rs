use std::sync::Arc;

use crate::domain::user::User;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::UserRepository;

pub struct GetUserUseCase {
    pub user_repository: Arc<dyn UserRepository>,
}

impl GetUserUseCase {
    /// `None` when the id matches no user: a deleted account whose token is
    /// still inside its lifetime, not an error.
    pub async fn execute(&self, user_id: &str) -> DomainResult<Option<User>> {
        self.user_repository.find_by_id(user_id).await
    }
}
