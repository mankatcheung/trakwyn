use crate::http::container::Container;
use crate::use_cases::notifications::CreateNotificationUseCase;
use crate::use_cases::sessions::{
    CreateSessionUseCase, ListSessionsUseCase, RevokeOtherSessionsUseCase, RevokeSessionUseCase,
    RotateRefreshTokenUseCase,
};

impl Container {
    pub fn create_session_use_case(&self) -> CreateSessionUseCase {
        CreateSessionUseCase {
            session_repository: self.session_repository.clone(),
            user_repository: self.user_repository.clone(),
            device_labeler: self.services.device_labeler.clone(),
            ip_location_resolver: self.services.ip_location_resolver.clone(),
            email_service: self.services.email_service.clone(),
            // Built here rather than through a `create_notification_use_case`
            // factory, which belongs to the notifications domain's DI module.
            create_notification_use_case: CreateNotificationUseCase {
                notification_repository: self.notification_repository.clone(),
                generate_id: self.generate_id.clone(),
            },
            generate_id: self.generate_id.clone(),
        }
    }

    pub fn rotate_refresh_token_use_case(&self) -> RotateRefreshTokenUseCase {
        RotateRefreshTokenUseCase {
            session_repository: self.session_repository.clone(),
            generate_id: self.generate_id.clone(),
            logger: self.services.logger.clone(),
        }
    }

    pub fn list_sessions_use_case(&self) -> ListSessionsUseCase {
        ListSessionsUseCase { session_repository: self.session_repository.clone() }
    }

    pub fn revoke_session_use_case(&self) -> RevokeSessionUseCase {
        RevokeSessionUseCase {
            session_repository: self.session_repository.clone(),
            security_event_repository: self.security_event_repository.clone(),
            generate_id: self.generate_id.clone(),
        }
    }

    pub fn revoke_other_sessions_use_case(&self) -> RevokeOtherSessionsUseCase {
        RevokeOtherSessionsUseCase {
            session_repository: self.session_repository.clone(),
            security_event_repository: self.security_event_repository.clone(),
            generate_id: self.generate_id.clone(),
        }
    }
}
