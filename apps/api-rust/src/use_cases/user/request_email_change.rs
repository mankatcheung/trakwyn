use std::sync::Arc;

use chrono::TimeDelta;

use super::password_hashing::verify_password;
use super::secrets::{random_hex, sha256_hex};
use crate::use_cases::auth::{assert_has_password, is_session_fresh, SessionAuthTime};
use crate::use_cases::clock::now;
use crate::use_cases::constants::email_verification_token::{RANDOM_BYTES, TTL_MS};
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{
    CreateEmailVerificationTokenData, EmailService, EmailVerificationTokenRepository, RateLimiter,
    UserRepository,
};

pub struct RequestEmailChangeInput {
    pub user_id: String,
    pub current_password: String,
    pub new_email: String,
    pub auth_time: SessionAuthTime,
}

pub struct RequestEmailChangeUseCase {
    pub user_repository: Arc<dyn UserRepository>,
    pub email_verification_token_repository: Arc<dyn EmailVerificationTokenRepository>,
    pub email_service: Arc<dyn EmailService>,
    pub request_email_change_rate_limiter: Arc<dyn RateLimiter>,
    pub generate_id: GenerateId,
    pub web_app_origin: String,
}

impl RequestEmailChangeUseCase {
    pub async fn execute(&self, input: RequestEmailChangeInput) -> DomainResult<()> {
        // Rate-limit by user ID to prevent abuse of email change requests
        let key = format!("request-email-change:user:{}", input.user_id);
        if !self.request_email_change_rate_limiter.consume(&key).await {
            return Err(DomainError::rate_limited(
                "Too many email change requests. Try again later.",
            ));
        }

        let user = self
            .user_repository
            .find_by_id(&input.user_id)
            .await?
            .ok_or_else(|| DomainError::not_found("User not found"))?;
        let password_hash = assert_has_password(user.password_hash.as_deref())?;

        if !verify_password(&input.current_password, password_hash).await? {
            return Err(DomainError::unauthorized("Invalid password"));
        }

        if user.totp_enabled && !is_session_fresh(input.auth_time) {
            return Err(DomainError::step_up_required(
                "Please verify your identity again to continue.",
            ));
        }

        let existing = self.user_repository.find_by_email(&input.new_email).await?;
        if existing.is_some_and(|existing| existing.id != input.user_id) {
            return Err(DomainError::conflict("Email already in use"));
        }

        // The email itself is not changed here: only a confirmation link is
        // sent to the new address. The change takes effect once that link is
        // clicked (ConfirmEmailChangeUseCase), so a typo'd address can never
        // lock the user out of their account.
        self.email_verification_token_repository.delete_all_for_user(&user.id).await?;

        let raw_token = random_hex(RANDOM_BYTES);
        self.email_verification_token_repository
            .create(CreateEmailVerificationTokenData {
                id: (self.generate_id)(),
                user_id: user.id.clone(),
                token_hash: sha256_hex(&raw_token),
                new_email: Some(input.new_email.clone()),
                expires_at: now() + TimeDelta::milliseconds(TTL_MS),
            })
            .await?;

        let confirm_url = format!("{}/confirm-email-change?token={raw_token}", self.web_app_origin);
        self.email_service.send_email_verification(&input.new_email, &confirm_url).await
    }
}
