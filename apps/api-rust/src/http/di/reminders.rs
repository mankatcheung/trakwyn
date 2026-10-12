use crate::http::container::Container;
use crate::use_cases::reminders::SendFollowUpRemindersUseCase;

impl Container {
    pub fn send_follow_up_reminders_use_case(&self) -> SendFollowUpRemindersUseCase {
        SendFollowUpRemindersUseCase {
            application_repository: self.application_repository.clone(),
            user_repository: self.user_repository.clone(),
            email_service: self.services.email_service.clone(),
        }
    }
}
