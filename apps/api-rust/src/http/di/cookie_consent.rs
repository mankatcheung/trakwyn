use crate::http::container::Container;
use crate::use_cases::cookie_consent::RecordCookieConsentUseCase;

impl Container {
    pub fn record_cookie_consent_use_case(&self) -> RecordCookieConsentUseCase {
        RecordCookieConsentUseCase {
            cookie_consent_repository: self.cookie_consent_repository.clone(),
            generate_id: self.generate_id.clone(),
        }
    }
}
