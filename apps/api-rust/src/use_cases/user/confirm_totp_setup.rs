use std::sync::Arc;

use super::backup_codes::{generate_backup_codes, store_backup_codes};
use crate::domain::security_event::SecurityEventType;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{
    CreateSecurityEventData, SecurityEventRepository, TotpBackupCodeRepository, TotpProvider,
    UpdateUserData, UserRepository,
};

pub struct ConfirmTotpSetupInput {
    pub user_id: String,
    pub code: String,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConfirmTotpSetupOutput {
    /// The raw codes, shown once. Only their hashes are stored.
    pub backup_codes: Vec<String>,
}

pub struct ConfirmTotpSetupUseCase {
    pub user_repository: Arc<dyn UserRepository>,
    pub totp_backup_code_repository: Arc<dyn TotpBackupCodeRepository>,
    pub totp_provider: Arc<dyn TotpProvider>,
    pub security_event_repository: Arc<dyn SecurityEventRepository>,
    pub generate_id: GenerateId,
}

impl ConfirmTotpSetupUseCase {
    pub async fn execute(&self, input: ConfirmTotpSetupInput) -> DomainResult<ConfirmTotpSetupOutput> {
        let user = self
            .user_repository
            .find_by_id(&input.user_id)
            .await?
            .ok_or_else(|| DomainError::not_found("User not found"))?;

        if user.totp_enabled {
            return Err(DomainError::conflict("Two-factor authentication is already enabled"));
        }
        let encrypted_secret = user
            .totp_secret
            .filter(|secret| !secret.is_empty())
            .ok_or_else(|| DomainError::conflict("No two-factor setup in progress"))?;

        let secret = self.totp_provider.decrypt_secret(&encrypted_secret)?;
        // A code that is not six digits is an error from the provider, not a
        // mismatch, exactly as in `apps/api` (its TOTP library throws).
        if !self.totp_provider.verify_code(&secret, &input.code)? {
            return Err(DomainError::unauthorized("Invalid verification code"));
        }

        self.user_repository
            .update(
                &input.user_id,
                UpdateUserData { totp_enabled: Some(true), ..UpdateUserData::default() },
            )
            .await?;

        let backup_codes = generate_backup_codes();
        store_backup_codes(
            self.totp_backup_code_repository.as_ref(),
            &self.generate_id,
            &input.user_id,
            &backup_codes,
        )
        .await?;

        self.security_event_repository
            .create(CreateSecurityEventData {
                id: (self.generate_id)(),
                user_id: input.user_id,
                event_type: SecurityEventType::TotpEnabled,
                ip_address: input.ip_address,
                user_agent: input.user_agent,
            })
            .await?;

        Ok(ConfirmTotpSetupOutput { backup_codes })
    }
}
