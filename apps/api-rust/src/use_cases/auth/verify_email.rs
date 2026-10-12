use std::sync::Arc;

use crate::use_cases::auth::token_hashing::hash_token;
use crate::use_cases::clock::now;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{EmailVerificationTokenRepository, UpdateUserData, UserRepository};

pub struct VerifyEmailInput {
    pub token: String,
}

pub struct VerifyEmailUseCase {
    pub user_repository: Arc<dyn UserRepository>,
    pub email_verification_token_repository: Arc<dyn EmailVerificationTokenRepository>,
}

impl VerifyEmailUseCase {
    pub async fn execute(&self, input: VerifyEmailInput) -> DomainResult<()> {
        let verification_token = self
            .email_verification_token_repository
            .find_by_token_hash(&hash_token(&input.token))
            .await?
            .filter(|token| token.used_at.is_none() && token.expires_at >= now())
            .ok_or_else(|| DomainError::unauthorized("Invalid or expired verification link"))?;

        self.user_repository
            .update(
                &verification_token.user_id,
                UpdateUserData {
                    email_verified_at: Some(Some(now())),
                    ..UpdateUserData::default()
                },
            )
            .await?;
        self.email_verification_token_repository.mark_used(&verification_token.id).await
    }
}
