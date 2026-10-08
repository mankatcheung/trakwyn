use std::sync::Arc;

use crate::http::container::Container;
use crate::infrastructure::auth::PngQrCodeRenderer;
use crate::use_cases::user::*;

impl Container {
    pub fn get_user_use_case(&self) -> GetUserUseCase {
        GetUserUseCase { user_repository: self.user_repository.clone() }
    }

    pub fn update_profile_use_case(&self) -> UpdateProfileUseCase {
        UpdateProfileUseCase { user_repository: self.user_repository.clone() }
    }

    pub fn dismiss_onboarding_checklist_use_case(&self) -> DismissOnboardingChecklistUseCase {
        DismissOnboardingChecklistUseCase { user_repository: self.user_repository.clone() }
    }

    pub fn update_password_use_case(&self) -> UpdatePasswordUseCase {
        UpdatePasswordUseCase {
            user_repository: self.user_repository.clone(),
            update_password_rate_limiter: self.services.rate_limiters.update_password.clone(),
            security_event_repository: self.security_event_repository.clone(),
            generate_id: self.generate_id.clone(),
        }
    }

    pub fn request_email_change_use_case(&self) -> RequestEmailChangeUseCase {
        RequestEmailChangeUseCase {
            user_repository: self.user_repository.clone(),
            email_verification_token_repository: self.email_verification_token_repository.clone(),
            email_service: self.services.email_service.clone(),
            request_email_change_rate_limiter: self
                .services
                .rate_limiters
                .request_email_change
                .clone(),
            generate_id: self.generate_id.clone(),
            web_app_origin: self.services.web_app_origin.clone(),
        }
    }

    pub fn confirm_email_change_use_case(&self) -> ConfirmEmailChangeUseCase {
        ConfirmEmailChangeUseCase {
            user_repository: self.user_repository.clone(),
            email_verification_token_repository: self.email_verification_token_repository.clone(),
            security_event_repository: self.security_event_repository.clone(),
            generate_id: self.generate_id.clone(),
        }
    }

    pub fn request_add_backup_email_use_case(&self) -> RequestAddBackupEmailUseCase {
        RequestAddBackupEmailUseCase {
            user_repository: self.user_repository.clone(),
            backup_email_verification_token_repository: self
                .backup_email_verification_token_repository
                .clone(),
            email_service: self.services.email_service.clone(),
            request_add_backup_email_rate_limiter: self
                .services
                .rate_limiters
                .request_add_backup_email
                .clone(),
            generate_id: self.generate_id.clone(),
            web_app_origin: self.services.web_app_origin.clone(),
        }
    }

    pub fn confirm_backup_email_use_case(&self) -> ConfirmBackupEmailUseCase {
        ConfirmBackupEmailUseCase {
            user_repository: self.user_repository.clone(),
            backup_email_verification_token_repository: self
                .backup_email_verification_token_repository
                .clone(),
        }
    }

    pub fn remove_backup_email_use_case(&self) -> RemoveBackupEmailUseCase {
        RemoveBackupEmailUseCase {
            user_repository: self.user_repository.clone(),
            backup_email_verification_token_repository: self
                .backup_email_verification_token_repository
                .clone(),
            remove_backup_email_rate_limiter: self
                .services
                .rate_limiters
                .remove_backup_email
                .clone(),
        }
    }

    pub fn generate_totp_secret_use_case(&self) -> GenerateTotpSecretUseCase {
        GenerateTotpSecretUseCase {
            user_repository: self.user_repository.clone(),
            totp_provider: self.services.totp_provider.clone(),
            // Stateless, so built here until `Services` carries one.
            qr_code_renderer: Arc::new(PngQrCodeRenderer),
        }
    }

    pub fn confirm_totp_setup_use_case(&self) -> ConfirmTotpSetupUseCase {
        ConfirmTotpSetupUseCase {
            user_repository: self.user_repository.clone(),
            totp_backup_code_repository: self.totp_backup_code_repository.clone(),
            totp_provider: self.services.totp_provider.clone(),
            security_event_repository: self.security_event_repository.clone(),
            generate_id: self.generate_id.clone(),
        }
    }

    pub fn disable_totp_use_case(&self) -> DisableTotpUseCase {
        DisableTotpUseCase {
            user_repository: self.user_repository.clone(),
            totp_backup_code_repository: self.totp_backup_code_repository.clone(),
            security_event_repository: self.security_event_repository.clone(),
            generate_id: self.generate_id.clone(),
        }
    }

    pub fn regenerate_totp_backup_codes_use_case(&self) -> RegenerateTotpBackupCodesUseCase {
        RegenerateTotpBackupCodesUseCase {
            user_repository: self.user_repository.clone(),
            totp_backup_code_repository: self.totp_backup_code_repository.clone(),
            security_event_repository: self.security_event_repository.clone(),
            generate_id: self.generate_id.clone(),
        }
    }

    pub fn get_totp_status_use_case(&self) -> GetTotpStatusUseCase {
        GetTotpStatusUseCase { user_repository: self.user_repository.clone() }
    }

    pub fn request_avatar_upload_url_use_case(&self) -> RequestAvatarUploadUrlUseCase {
        RequestAvatarUploadUrlUseCase {
            storage_provider: self.services.storage_provider.clone(),
            generate_id: self.generate_id.clone(),
        }
    }

    pub fn confirm_avatar_use_case(&self) -> ConfirmAvatarUseCase {
        ConfirmAvatarUseCase {
            user_repository: self.user_repository.clone(),
            storage_provider: self.services.storage_provider.clone(),
        }
    }

    pub fn remove_avatar_use_case(&self) -> RemoveAvatarUseCase {
        RemoveAvatarUseCase {
            user_repository: self.user_repository.clone(),
            storage_provider: self.services.storage_provider.clone(),
        }
    }

    pub fn delete_account_use_case(&self) -> DeleteAccountUseCase {
        DeleteAccountUseCase {
            user_repository: self.user_repository.clone(),
            document_repository: self.document_repository.clone(),
            storage_provider: self.services.storage_provider.clone(),
        }
    }

    pub fn export_user_data_use_case(&self) -> ExportUserDataUseCase {
        ExportUserDataUseCase {
            user_repository: self.user_repository.clone(),
            application_repository: self.application_repository.clone(),
            note_repository: self.note_repository.clone(),
            document_repository: self.document_repository.clone(),
        }
    }

    pub fn import_user_data_use_case(&self) -> ImportUserDataUseCase {
        ImportUserDataUseCase {
            application_repository: self.application_repository.clone(),
            note_repository: self.note_repository.clone(),
            generate_id: self.generate_id.clone(),
        }
    }

    pub fn get_notification_preferences_use_case(&self) -> GetNotificationPreferencesUseCase {
        GetNotificationPreferencesUseCase { user_repository: self.user_repository.clone() }
    }

    pub fn update_notification_preferences_use_case(&self) -> UpdateNotificationPreferencesUseCase {
        UpdateNotificationPreferencesUseCase { user_repository: self.user_repository.clone() }
    }
}
