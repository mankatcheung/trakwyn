use std::sync::Arc;

use crate::domain::oauth_account::OAuthProviderName;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{
    CreateOAuthAccountData, OAuthAccountRepository, OAuthProviderRegistry,
};

pub struct LinkOAuthAccountInput {
    pub user_id: String,
    pub provider: OAuthProviderName,
    pub code: String,
    pub redirect_uri: String,
    /// PKCE verifier held server-side since `/start`; proves this exchange
    /// belongs to that flow.
    pub code_verifier: String,
}

pub struct LinkOAuthAccountUseCase {
    pub oauth_account_repository: Arc<dyn OAuthAccountRepository>,
    pub oauth_provider_registry: Arc<dyn OAuthProviderRegistry>,
    pub generate_id: GenerateId,
}

impl LinkOAuthAccountUseCase {
    pub async fn execute(&self, input: LinkOAuthAccountInput) -> DomainResult<()> {
        let provider = self.oauth_provider_registry.get(input.provider);
        let profile = provider
            .exchange_code_for_profile(&input.code, &input.redirect_uri, &input.code_verifier)
            .await?;

        let existing = self
            .oauth_account_repository
            .find_by_provider(input.provider, &profile.provider_account_id)
            .await?;
        if let Some(existing) = existing {
            if existing.user_id == input.user_id {
                // Already linked: an idempotent no-op.
                return Ok(());
            }
            return Err(DomainError::conflict("This account is already linked to another user"));
        }

        self.oauth_account_repository
            .create(CreateOAuthAccountData {
                id: (self.generate_id)(),
                user_id: input.user_id,
                provider: input.provider,
                provider_account_id: profile.provider_account_id,
                email: profile.email,
            })
            .await?;
        Ok(())
    }
}
