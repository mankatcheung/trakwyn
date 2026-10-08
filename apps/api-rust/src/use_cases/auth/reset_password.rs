use std::sync::Arc;

use crate::use_cases::auth::password_hashing::hash_password;
use crate::use_cases::auth::password_validation::assert_valid_password;
use crate::use_cases::auth::token_hashing::hash_token;
use crate::use_cases::clock::now;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{
    PasswordResetTokenRepository, SessionRepository, UpdateUserData, UserRepository,
};

pub struct ResetPasswordInput {
    pub token: String,
    pub new_password: String,
}

pub struct ResetPasswordUseCase {
    pub user_repository: Arc<dyn UserRepository>,
    pub password_reset_token_repository: Arc<dyn PasswordResetTokenRepository>,
    pub session_repository: Arc<dyn SessionRepository>,
}

impl ResetPasswordUseCase {
    pub async fn execute(&self, input: ResetPasswordInput) -> DomainResult<()> {
        assert_valid_password(&input.new_password)?;

        let reset_token = self
            .password_reset_token_repository
            .find_by_token_hash(&hash_token(&input.token))
            .await?
            .filter(|token| token.used_at.is_none() && token.expires_at >= now())
            .ok_or_else(|| DomainError::unauthorized("Invalid or expired reset link"))?;

        let password_hash = hash_password(&input.new_password).await?;
        self.user_repository
            .update(
                &reset_token.user_id,
                UpdateUserData { password_hash: Some(password_hash), ..UpdateUserData::default() },
            )
            .await?;
        self.password_reset_token_repository.mark_used(&reset_token.id).await?;
        // Every existing session is invalidated so a refresh token stolen
        // before the reset cannot survive it: otherwise the whole point of
        // the reset is defeated.
        self.session_repository.revoke_all_for_user(&reset_token.user_id).await
    }
}
