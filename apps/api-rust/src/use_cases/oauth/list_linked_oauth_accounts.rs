use std::sync::Arc;

use crate::domain::oauth_account::OAuthAccount;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::OAuthAccountRepository;

pub struct ListLinkedOAuthAccountsUseCase {
    pub oauth_account_repository: Arc<dyn OAuthAccountRepository>,
}

impl ListLinkedOAuthAccountsUseCase {
    pub async fn execute(&self, user_id: &str) -> DomainResult<Vec<OAuthAccount>> {
        self.oauth_account_repository.find_all_by_user_id(user_id).await
    }
}
