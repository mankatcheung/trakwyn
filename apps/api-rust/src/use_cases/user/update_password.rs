use std::sync::Arc;

use super::password_hashing::{hash_password, verify_password};
use crate::domain::security_event::SecurityEventType;
use crate::use_cases::auth::{
    assert_has_password, assert_valid_password, is_session_fresh, SessionAuthTime,
};
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{
    CreateSecurityEventData, RateLimiter, SecurityEventRepository, UpdateUserData, UserRepository,
};

pub struct UpdatePasswordInput {
    pub user_id: String,
    pub current_password: String,
    pub new_password: String,
    pub auth_time: SessionAuthTime,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
}

pub struct UpdatePasswordUseCase {
    pub user_repository: Arc<dyn UserRepository>,
    pub update_password_rate_limiter: Arc<dyn RateLimiter>,
    pub security_event_repository: Arc<dyn SecurityEventRepository>,
    pub generate_id: GenerateId,
}

impl UpdatePasswordUseCase {
    pub async fn execute(&self, input: UpdatePasswordInput) -> DomainResult<()> {
        assert_valid_password(&input.new_password)?;

        // Rate-limit by user ID to prevent brute-force attacks on password changes
        let key = format!("update-password:user:{}", input.user_id);
        if !self.update_password_rate_limiter.consume(&key).await {
            return Err(DomainError::rate_limited(
                "Too many password update requests. Try again later.",
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

        let password_hash = hash_password(&input.new_password).await?;
        self.user_repository
            .update(
                &input.user_id,
                UpdateUserData { password_hash: Some(password_hash), ..UpdateUserData::default() },
            )
            .await?;

        self.security_event_repository
            .create(CreateSecurityEventData {
                id: (self.generate_id)(),
                user_id: input.user_id,
                event_type: SecurityEventType::PasswordChanged,
                ip_address: input.ip_address,
                user_agent: input.user_agent,
            })
            .await?;
        Ok(())
    }
}
