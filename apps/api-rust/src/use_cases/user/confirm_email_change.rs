use std::sync::Arc;

use super::secrets::sha256_hex;
use crate::domain::security_event::SecurityEventType;
use crate::use_cases::clock::now;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{
    CreateSecurityEventData, EmailVerificationTokenRepository, SecurityEventRepository,
    UpdateUserData, UserRepository,
};

pub struct ConfirmEmailChangeInput {
    pub token: String,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
}

pub struct ConfirmEmailChangeUseCase {
    pub user_repository: Arc<dyn UserRepository>,
    pub email_verification_token_repository: Arc<dyn EmailVerificationTokenRepository>,
    pub security_event_repository: Arc<dyn SecurityEventRepository>,
    pub generate_id: GenerateId,
}

fn invalid_link() -> DomainError {
    DomainError::unauthorized("Invalid or expired confirmation link")
}

impl ConfirmEmailChangeUseCase {
    pub async fn execute(&self, input: ConfirmEmailChangeInput) -> DomainResult<()> {
        let token = self
            .email_verification_token_repository
            .find_by_token_hash(&sha256_hex(&input.token))
            .await?
            .ok_or_else(invalid_link)?;

        // A token with no new email is a registration-verification token, and
        // an empty one is treated the same way, as `apps/api` treats it.
        let new_email = token.new_email.filter(|email| !email.is_empty()).ok_or_else(invalid_link)?;
        if token.used_at.is_some() || token.expires_at < now() {
            return Err(invalid_link());
        }

        // Guard against a race: someone else may have taken the new address
        // while this confirmation link was sitting unused.
        let existing = self.user_repository.find_by_email(&new_email).await?;
        if existing.is_some_and(|existing| existing.id != token.user_id) {
            return Err(DomainError::conflict("Email already in use"));
        }

        self.user_repository
            .update(
                &token.user_id,
                UpdateUserData {
                    email: Some(new_email),
                    email_verified_at: Some(Some(now())),
                    ..UpdateUserData::default()
                },
            )
            .await?;
        self.email_verification_token_repository.mark_used(&token.id).await?;

        self.security_event_repository
            .create(CreateSecurityEventData {
                id: (self.generate_id)(),
                user_id: token.user_id,
                event_type: SecurityEventType::EmailChanged,
                ip_address: input.ip_address,
                user_agent: input.user_agent,
            })
            .await?;
        Ok(())
    }
}
