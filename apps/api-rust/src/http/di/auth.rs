use crate::http::container::Container;
use crate::use_cases::auth::{
    AuthenticateRequestUseCase, LoginUseCase, LoginWithTotpUseCase, ReauthenticateUseCase,
    RegisterUseCase, RequestBackupEmailRecoveryUseCase, RequestPasswordResetUseCase,
    ResetPasswordUseCase, SendEmailVerificationUseCase, VerifyEmailUseCase,
};
use crate::use_cases::login_events::GetLoginHistoryUseCase;
use crate::use_cases::security_events::GetSecurityActivityUseCase;

impl Container {
    pub fn authenticate_request_use_case(&self) -> AuthenticateRequestUseCase {
        AuthenticateRequestUseCase {
            token_service: self.token_service.clone(),
            validate_api_token_use_case: self.validate_api_token_use_case(),
            session_blocklist: self.session_blocklist.clone(),
        }
    }

    pub fn register_use_case(&self) -> RegisterUseCase {
        RegisterUseCase {
            user_repository: self.user_repository.clone(),
            generate_id: self.generate_id.clone(),
            send_email_verification_use_case: self.send_email_verification_use_case(),
        }
    }

    pub fn login_use_case(&self) -> LoginUseCase {
        LoginUseCase {
            user_repository: self.user_repository.clone(),
            login_event_repository: self.login_event_repository.clone(),
            generate_id: self.generate_id.clone(),
            logger: self.services.logger.clone(),
        }
    }

    pub fn login_with_totp_use_case(&self) -> LoginWithTotpUseCase {
        LoginWithTotpUseCase {
            user_repository: self.user_repository.clone(),
            totp_backup_code_repository: self.totp_backup_code_repository.clone(),
            totp_rate_limiter: self.services.rate_limiters.totp.clone(),
            totp_provider: self.services.totp_provider.clone(),
            logger: self.services.logger.clone(),
        }
    }

    pub fn reauthenticate_use_case(&self) -> ReauthenticateUseCase {
        ReauthenticateUseCase {
            user_repository: self.user_repository.clone(),
            totp_backup_code_repository: self.totp_backup_code_repository.clone(),
            totp_rate_limiter: self.services.rate_limiters.totp.clone(),
            totp_provider: self.services.totp_provider.clone(),
        }
    }

    pub fn request_password_reset_use_case(&self) -> RequestPasswordResetUseCase {
        RequestPasswordResetUseCase {
            user_repository: self.user_repository.clone(),
            password_reset_token_repository: self.password_reset_token_repository.clone(),
            email_service: self.services.email_service.clone(),
            password_reset_rate_limiter: self.services.rate_limiters.password_reset.clone(),
            generate_id: self.generate_id.clone(),
            web_app_origin: self.services.web_app_origin.clone(),
        }
    }

    pub fn reset_password_use_case(&self) -> ResetPasswordUseCase {
        ResetPasswordUseCase {
            user_repository: self.user_repository.clone(),
            password_reset_token_repository: self.password_reset_token_repository.clone(),
            session_repository: self.session_repository.clone(),
        }
    }

    pub fn send_email_verification_use_case(&self) -> SendEmailVerificationUseCase {
        SendEmailVerificationUseCase {
            user_repository: self.user_repository.clone(),
            email_verification_token_repository: self.email_verification_token_repository.clone(),
            email_service: self.services.email_service.clone(),
            generate_id: self.generate_id.clone(),
            web_app_origin: self.services.web_app_origin.clone(),
        }
    }

    pub fn verify_email_use_case(&self) -> VerifyEmailUseCase {
        VerifyEmailUseCase {
            user_repository: self.user_repository.clone(),
            email_verification_token_repository: self.email_verification_token_repository.clone(),
        }
    }

    pub fn request_backup_email_recovery_use_case(&self) -> RequestBackupEmailRecoveryUseCase {
        RequestBackupEmailRecoveryUseCase {
            user_repository: self.user_repository.clone(),
            password_reset_token_repository: self.password_reset_token_repository.clone(),
            email_service: self.services.email_service.clone(),
            backup_email_recovery_rate_limiter: self
                .services
                .rate_limiters
                .backup_email_recovery
                .clone(),
            generate_id: self.generate_id.clone(),
            web_app_origin: self.services.web_app_origin.clone(),
        }
    }

    pub fn get_login_history_use_case(&self) -> GetLoginHistoryUseCase {
        GetLoginHistoryUseCase { login_event_repository: self.login_event_repository.clone() }
    }

    pub fn get_security_activity_use_case(&self) -> GetSecurityActivityUseCase {
        GetSecurityActivityUseCase {
            login_event_repository: self.login_event_repository.clone(),
            security_event_repository: self.security_event_repository.clone(),
        }
    }
}
