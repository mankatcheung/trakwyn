use std::sync::Arc;

use crate::use_cases::auth::password_hashing::hash_password;
use crate::use_cases::auth::password_validation::assert_valid_password;
use crate::use_cases::auth::send_email_verification::SendEmailVerificationUseCase;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{CreateUserData, UserRepository};

pub struct RegisterInput {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RegisterOutput {
    pub user_id: String,
    pub email: String,
}

pub struct RegisterUseCase {
    pub user_repository: Arc<dyn UserRepository>,
    pub generate_id: GenerateId,
    pub send_email_verification_use_case: SendEmailVerificationUseCase,
}

impl RegisterUseCase {
    pub async fn execute(&self, input: RegisterInput) -> DomainResult<RegisterOutput> {
        assert_valid_password(&input.password)?;

        if self.user_repository.find_by_email(&input.email).await?.is_some() {
            return Err(DomainError::conflict("Email already registered"));
        }

        let password_hash = hash_password(&input.password).await?;
        let user = self
            .user_repository
            .create(CreateUserData {
                id: (self.generate_id)(),
                email: input.email,
                password_hash: Some(password_hash),
                ..CreateUserData::default()
            })
            .await?;

        // Verification email delivery is non-critical: account creation is
        // not blocked when the email provider is down or unconfigured (e.g.
        // local dev).
        let _ = self.send_email_verification_use_case.execute(&user.id).await;

        Ok(RegisterOutput { user_id: user.id, email: user.email })
    }
}
