use std::sync::Arc;

use chrono::TimeDelta;

use crate::use_cases::auth::token_hashing::{generate_raw_token, hash_token};
use crate::use_cases::clock::now;
use crate::use_cases::constants::password_reset_token::{RANDOM_BYTES, TTL_MS};
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{
    CreatePasswordResetTokenData, EmailService, PasswordResetTokenRepository, RateLimiter,
    UserRepository,
};

pub struct RequestPasswordResetInput {
    pub email: String,
    pub ip_address: Option<String>,
}

pub struct RequestPasswordResetUseCase {
    pub user_repository: Arc<dyn UserRepository>,
    pub password_reset_token_repository: Arc<dyn PasswordResetTokenRepository>,
    pub email_service: Arc<dyn EmailService>,
    pub password_reset_rate_limiter: Arc<dyn RateLimiter>,
    pub generate_id: GenerateId,
    pub web_app_origin: String,
}

impl RequestPasswordResetUseCase {
    pub async fn execute(&self, input: RequestPasswordResetInput) -> DomainResult<()> {
        // Rate-limited by both email and IP *before* the account is looked
        // up, and by the same amount of work whatever the outcome, so a
        // rate-limit response never reveals whether the account exists.
        let email_allowed = self
            .password_reset_rate_limiter
            .consume(&format!("password-reset:email:{}", input.email.to_lowercase()))
            .await;
        let ip_allowed = match input.ip_address.as_deref().filter(|ip| !ip.is_empty()) {
            Some(ip_address) => {
                self.password_reset_rate_limiter
                    .consume(&format!("password-reset:ip:{ip_address}"))
                    .await
            }
            None => true,
        };
        if !email_allowed || !ip_allowed {
            return Err(DomainError::rate_limited(
                "Too many password reset requests. Try again later.",
            ));
        }

        // A silent no-op for an unknown email, so this endpoint cannot be
        // used to enumerate accounts.
        let Some(user) = self.user_repository.find_by_email(&input.email).await? else {
            return Ok(());
        };

        self.password_reset_token_repository.delete_all_for_user(&user.id).await?;

        let raw_token = generate_raw_token(RANDOM_BYTES);
        self.password_reset_token_repository
            .create(CreatePasswordResetTokenData {
                id: (self.generate_id)(),
                user_id: user.id.clone(),
                token_hash: hash_token(&raw_token),
                expires_at: now() + TimeDelta::milliseconds(TTL_MS),
            })
            .await?;

        let reset_url = format!("{}/reset-password?token={raw_token}", self.web_app_origin);
        // An email-provider failure must not surface differently from the
        // silent no-op above for unknown emails: errors only ever occur for
        // real accounts, so reporting one would be an enumeration oracle.
        let _ = self.email_service.send_password_reset(&user.email, &reset_url).await;
        Ok(())
    }
}
