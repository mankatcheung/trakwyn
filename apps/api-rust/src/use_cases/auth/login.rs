use std::sync::Arc;

use crate::domain::user::User;
use crate::use_cases::auth::log_auth_failure::{log_auth_failure, AuthFailureReason};
use crate::use_cases::auth::password_hash_guard::assert_has_password;
use crate::use_cases::auth::password_hashing::verify_password;
use crate::use_cases::constants::auth_failure_events;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::logger::Logger;
use crate::use_cases::ports::{CreateLoginEventData, LoginEventRepository, UserRepository};

pub struct LoginInput {
    pub email: String,
    pub password: String,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
}

pub struct LoginUseCase {
    pub user_repository: Arc<dyn UserRepository>,
    pub login_event_repository: Arc<dyn LoginEventRepository>,
    pub generate_id: GenerateId,
    pub logger: Arc<dyn Logger>,
}

impl LoginUseCase {
    pub async fn execute(&self, input: LoginInput) -> DomainResult<User> {
        let Some(user) = self.user_repository.find_by_email(&input.email).await? else {
            self.log_failure(AuthFailureReason::InvalidCredentials);
            return Err(DomainError::user_not_found(
                "No account found with this email. Please register first.",
            ));
        };
        if user.password_hash.is_none() {
            self.log_failure(AuthFailureReason::NoPassword);
        }
        let password_hash = assert_has_password(user.password_hash.as_deref())?;

        if !verify_password(&input.password, password_hash).await? {
            self.log_failure(AuthFailureReason::InvalidCredentials);
            return Err(DomainError::unauthorized("Invalid credentials"));
        }

        self.login_event_repository
            .create(CreateLoginEventData {
                id: (self.generate_id)(),
                user_id: user.id.clone(),
                ip_address: input.ip_address,
                user_agent: input.user_agent,
            })
            .await?;

        Ok(user)
    }

    /// `LoginEvent` records successes only, so a refusal is logged here or
    /// nowhere (JEF-354).
    fn log_failure(&self, reason: AuthFailureReason) {
        log_auth_failure(self.logger.as_ref(), auth_failure_events::LOGIN_FAILED, reason, None);
    }
}
