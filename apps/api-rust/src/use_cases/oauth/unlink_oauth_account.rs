use std::sync::Arc;

use crate::domain::oauth_account::OAuthProviderName;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{OAuthAccountRepository, UserRepository};

pub struct UnlinkOAuthAccountInput {
    pub user_id: String,
    pub provider: OAuthProviderName,
}

pub struct UnlinkOAuthAccountUseCase {
    pub user_repository: Arc<dyn UserRepository>,
    pub oauth_account_repository: Arc<dyn OAuthAccountRepository>,
}

impl UnlinkOAuthAccountUseCase {
    pub async fn execute(&self, input: UnlinkOAuthAccountInput) -> DomainResult<()> {
        let links = self.oauth_account_repository.find_all_by_user_id(&input.user_id).await?;
        let Some(target) = links.iter().find(|link| link.provider == input.provider) else {
            // Already unlinked: an idempotent no-op.
            return Ok(());
        };

        let user = self
            .user_repository
            .find_by_id(&input.user_id)
            .await?
            .ok_or_else(|| DomainError::not_found("User not found"))?;

        // If this is the only way to sign in (no password, no other linked
        // provider), removing it would lock the user out entirely.
        if user.password_hash.is_none() && links.len() == 1 {
            return Err(DomainError::validation(
                "Set a password before unlinking your only sign-in method",
            ));
        }

        self.oauth_account_repository.delete(&target.id).await
    }
}
