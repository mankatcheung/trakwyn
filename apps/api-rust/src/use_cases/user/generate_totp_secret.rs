use std::sync::Arc;

use super::password_hashing::verify_password;
use crate::use_cases::auth::assert_has_password;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{QrCodeRenderer, TotpProvider, UpdateUserData, UserRepository};

pub struct GenerateTotpSecretInput {
    pub user_id: String,
    pub password: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TotpSetup {
    pub secret: String,
    pub otpauth_url: String,
    pub qr_code_data_url: String,
}

pub struct GenerateTotpSecretUseCase {
    pub user_repository: Arc<dyn UserRepository>,
    pub totp_provider: Arc<dyn TotpProvider>,
    pub qr_code_renderer: Arc<dyn QrCodeRenderer>,
}

impl GenerateTotpSecretUseCase {
    pub async fn execute(&self, input: GenerateTotpSecretInput) -> DomainResult<TotpSetup> {
        let user = self
            .user_repository
            .find_by_id(&input.user_id)
            .await?
            .ok_or_else(|| DomainError::not_found("User not found"))?;

        if user.totp_enabled {
            return Err(DomainError::conflict("Two-factor authentication is already enabled"));
        }

        let password_hash = assert_has_password(user.password_hash.as_deref())?;
        if !verify_password(&input.password, password_hash).await? {
            return Err(DomainError::unauthorized("Invalid password"));
        }

        let secret = self.totp_provider.generate_secret();
        let otpauth_url = self.totp_provider.get_otpauth_url(&secret, &user.email)?;
        let qr_code_data_url = self.qr_code_renderer.to_data_url(&otpauth_url)?;

        // Stored encrypted and not yet enabled: ConfirmTotpSetupUseCase turns
        // it on once the user proves the authenticator has it.
        self.user_repository
            .update(
                &input.user_id,
                UpdateUserData {
                    totp_secret: Some(Some(self.totp_provider.encrypt_secret(&secret)?)),
                    ..UpdateUserData::default()
                },
            )
            .await?;

        Ok(TotpSetup { secret, otpauth_url, qr_code_data_url })
    }
}
