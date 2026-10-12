use std::sync::Arc;

use super::backup_codes::{generate_backup_codes, store_backup_codes};
use super::password_hashing::verify_password;
use crate::domain::security_event::SecurityEventType;
use crate::use_cases::auth::{assert_has_password, is_session_fresh, SessionAuthTime};
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{
    CreateSecurityEventData, SecurityEventRepository, TotpBackupCodeRepository, UserRepository,
};

pub struct RegenerateTotpBackupCodesInput {
    pub user_id: String,
    pub current_password: String,
    pub auth_time: SessionAuthTime,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RegenerateTotpBackupCodesOutput {
    pub backup_codes: Vec<String>,
}

pub struct RegenerateTotpBackupCodesUseCase {
    pub user_repository: Arc<dyn UserRepository>,
    pub totp_backup_code_repository: Arc<dyn TotpBackupCodeRepository>,
    pub security_event_repository: Arc<dyn SecurityEventRepository>,
    pub generate_id: GenerateId,
}

impl RegenerateTotpBackupCodesUseCase {
    pub async fn execute(
        &self,
        input: RegenerateTotpBackupCodesInput,
    ) -> DomainResult<RegenerateTotpBackupCodesOutput> {
        let user = self
            .user_repository
            .find_by_id(&input.user_id)
            .await?
            .ok_or_else(|| DomainError::not_found("User not found"))?;
        if !user.totp_enabled {
            return Err(DomainError::conflict("Two-factor authentication is not enabled"));
        }
        let password_hash = assert_has_password(user.password_hash.as_deref())?;

        if !verify_password(&input.current_password, password_hash).await? {
            return Err(DomainError::unauthorized("Invalid password"));
        }
        if !is_session_fresh(input.auth_time) {
            return Err(DomainError::step_up_required(
                "Please verify your identity again to continue.",
            ));
        }

        let backup_codes = generate_backup_codes();
        self.totp_backup_code_repository.delete_all_for_user(&input.user_id).await?;
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
                event_type: SecurityEventType::TotpBackupCodesRegenerated,
                ip_address: input.ip_address,
                user_agent: input.user_agent,
            })
            .await?;

        Ok(RegenerateTotpBackupCodesOutput { backup_codes })
    }
}
