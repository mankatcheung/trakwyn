use crate::http::container::Container;
use crate::use_cases::digest::SendWeeklyDigestUseCase;

impl Container {
    pub fn send_weekly_digest_use_case(&self) -> SendWeeklyDigestUseCase {
        SendWeeklyDigestUseCase {
            user_repository: self.user_repository.clone(),
            application_repository: self.application_repository.clone(),
            email_service: self.services.email_service.clone(),
        }
    }
}
