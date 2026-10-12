use std::sync::Arc;

use super::password_hashing::verify_password;
use crate::domain::security_event::SecurityEventType;
use crate::use_cases::auth::assert_has_password;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{
    CreateSecurityEventData, SecurityEventRepository, TotpBackupCodeRepository, UpdateUserData,
    UserRepository,
};

pub struct DisableTotpInput {
    pub user_id: String,
    pub password: String,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
}

pub struct DisableTotpUseCase {
    pub user_repository: Arc<dyn UserRepository>,
    pub totp_backup_code_repository: Arc<dyn TotpBackupCodeRepository>,
    pub security_event_repository: Arc<dyn SecurityEventRepository>,
    pub generate_id: GenerateId,
}

impl DisableTotpUseCase {
    pub async fn execute(&self, input: DisableTotpInput) -> DomainResult<()> {
        let user = self
            .user_repository
            .find_by_id(&input.user_id)
            .await?
            .ok_or_else(|| DomainError::not_found("User not found"))?;
        let password_hash = assert_has_password(user.password_hash.as_deref())?;

        if !verify_password(&input.password, password_hash).await? {
            return Err(DomainError::unauthorized("Invalid password"));
        }

        self.user_repository
            .update(
                &input.user_id,
                UpdateUserData {
                    totp_enabled: Some(false),
                    totp_secret: Some(None),
                    ..UpdateUserData::default()
                },
            )
            .await?;
        self.totp_backup_code_repository.delete_all_for_user(&input.user_id).await?;

        self.security_event_repository
            .create(CreateSecurityEventData {
                id: (self.generate_id)(),
                user_id: input.user_id,
                event_type: SecurityEventType::TotpDisabled,
                ip_address: input.ip_address,
                user_agent: input.user_agent,
            })
            .await?;
        Ok(())
    }
}
