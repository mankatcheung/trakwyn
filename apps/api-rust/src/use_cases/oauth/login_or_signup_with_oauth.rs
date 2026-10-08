use std::sync::Arc;

use crate::domain::oauth_account::OAuthProviderName;
use crate::domain::user::User;
use crate::use_cases::clock::now;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{
    CreateOAuthAccountData, CreateUserData, OAuthAccountRepository, OAuthProviderRegistry,
    UserRepository,
};

pub struct LoginOrSignupWithOAuthInput {
    pub provider: OAuthProviderName,
    pub code: String,
    pub redirect_uri: String,
    /// PKCE verifier held server-side since `/start`; proves this exchange
    /// belongs to that flow.
    pub code_verifier: String,
}

#[derive(Debug)]
pub struct LoginOrSignupWithOAuthOutput {
    pub user: User,
    pub is_new_user: bool,
}

pub struct LoginOrSignupWithOAuthUseCase {
    pub user_repository: Arc<dyn UserRepository>,
    pub oauth_account_repository: Arc<dyn OAuthAccountRepository>,
    pub oauth_provider_registry: Arc<dyn OAuthProviderRegistry>,
    pub generate_id: GenerateId,
}

impl LoginOrSignupWithOAuthUseCase {
    pub async fn execute(
        &self,
        input: LoginOrSignupWithOAuthInput,
    ) -> DomainResult<LoginOrSignupWithOAuthOutput> {
        let provider = self.oauth_provider_registry.get(input.provider);
        let profile = provider
            .exchange_code_for_profile(&input.code, &input.redirect_uri, &input.code_verifier)
            .await?;

        let existing_link = self
            .oauth_account_repository
            .find_by_provider(input.provider, &profile.provider_account_id)
            .await?;
        if let Some(existing_link) = existing_link {
            let user = self
                .user_repository
                .find_by_id(&existing_link.user_id)
                .await?
                .ok_or_else(|| DomainError::not_found("Linked account not found"))?;
            return Ok(LoginOrSignupWithOAuthOutput { user, is_new_user: false });
        }

        let verified_email =
            profile.email.clone().filter(|email| !email.is_empty() && profile.email_verified);
        let Some(email) = verified_email else {
            return Err(DomainError::validation(
                "Your provider did not share a verified email address, so an account cannot be created automatically.",
            ));
        };

        if self.user_repository.find_by_email(&email).await?.is_some() {
            // Deliberately not auto-linking: silently attaching a new OAuth
            // identity to an existing account on a matching email alone is a
            // known account-takeover vector. The user must log in with their
            // existing method first and link this provider from settings.
            return Err(DomainError::conflict(
                "An account with this email already exists. Log in and link this provider from account settings.",
            ));
        }

        let user = self
            .user_repository
            .create(CreateUserData {
                id: (self.generate_id)(),
                email: email.clone(),
                password_hash: None,
                name: profile.name,
                email_verified_at: Some(now()),
            })
            .await?;
        self.oauth_account_repository
            .create(CreateOAuthAccountData {
                id: (self.generate_id)(),
                user_id: user.id.clone(),
                provider: input.provider,
                provider_account_id: profile.provider_account_id,
                email: Some(email),
            })
            .await?;

        Ok(LoginOrSignupWithOAuthOutput { user, is_new_user: true })
    }
}
