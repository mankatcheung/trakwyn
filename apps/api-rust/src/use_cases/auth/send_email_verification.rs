use std::sync::Arc;

use chrono::TimeDelta;

use crate::use_cases::auth::token_hashing::{generate_raw_token, hash_token};
use crate::use_cases::clock::now;
use crate::use_cases::constants::email_verification_token::{RANDOM_BYTES, TTL_MS};
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{
    CreateEmailVerificationTokenData, EmailService, EmailVerificationTokenRepository,
    UserRepository,
};

pub struct SendEmailVerificationUseCase {
    pub user_repository: Arc<dyn UserRepository>,
    pub email_verification_token_repository: Arc<dyn EmailVerificationTokenRepository>,
    pub email_service: Arc<dyn EmailService>,
    pub generate_id: GenerateId,
    pub web_app_origin: String,
}

impl SendEmailVerificationUseCase {
    pub async fn execute(&self, user_id: &str) -> DomainResult<()> {
        let user = self
            .user_repository
            .find_by_id(user_id)
            .await?
            .ok_or_else(|| DomainError::not_found("User not found"))?;

        self.email_verification_token_repository.delete_all_for_user(&user.id).await?;

        let raw_token = generate_raw_token(RANDOM_BYTES);
        self.email_verification_token_repository
            .create(CreateEmailVerificationTokenData {
                id: (self.generate_id)(),
                user_id: user.id.clone(),
                token_hash: hash_token(&raw_token),
                new_email: None,
                expires_at: now() + TimeDelta::milliseconds(TTL_MS),
            })
            .await?;

        let verify_url = format!("{}/verify-email?token={raw_token}", self.web_app_origin);
        self.email_service.send_email_verification(&user.email, &verify_url).await
    }
}
