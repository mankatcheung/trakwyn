pub mod authenticate_mcp_request;
pub mod authenticate_request;
pub mod log_auth_failure;
pub mod login;
pub mod login_with_totp;
pub mod password_hash_guard;
pub mod password_hashing;
pub mod password_validation;
pub mod reauthenticate;
pub mod register;
pub mod request_backup_email_recovery;
pub mod request_password_reset;
pub mod reset_password;
pub mod send_email_verification;
pub mod session_freshness;
pub mod token_hashing;
pub mod verify_email;
pub mod verify_totp_or_backup_code;

pub use authenticate_mcp_request::{AuthenticateMcpRequestResult, AuthenticateMcpRequestUseCase};

pub use authenticate_request::{AuthenticateRequestUseCase, AuthenticatedUser};
pub use log_auth_failure::{log_auth_failure, AuthFailureReason};
pub use login::{LoginInput, LoginUseCase};
pub use login_with_totp::{LoginWithTotpInput, LoginWithTotpUseCase};
pub use password_hash_guard::assert_has_password;
pub use password_hashing::{hash_password, verify_password};
pub use password_validation::assert_valid_password;
pub use reauthenticate::{ReauthenticateInput, ReauthenticateOutput, ReauthenticateUseCase};
pub use register::{RegisterInput, RegisterOutput, RegisterUseCase};
pub use request_backup_email_recovery::{
    RequestBackupEmailRecoveryInput, RequestBackupEmailRecoveryUseCase,
};
pub use request_password_reset::{RequestPasswordResetInput, RequestPasswordResetUseCase};
pub use reset_password::{ResetPasswordInput, ResetPasswordUseCase};
pub use send_email_verification::SendEmailVerificationUseCase;
pub use session_freshness::{is_session_fresh, SessionAuthTime};
pub use token_hashing::{generate_raw_token, hash_token};
pub use verify_email::{VerifyEmailInput, VerifyEmailUseCase};
pub use verify_totp_or_backup_code::verify_totp_or_backup_code;

#[cfg(test)]
mod tests_login;
#[cfg(test)]
mod tests_recovery;
#[cfg(test)]
mod tests_registration;
