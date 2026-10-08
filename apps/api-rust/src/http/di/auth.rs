use crate::http::container::Container;
use crate::use_cases::auth::AuthenticateRequestUseCase;

impl Container {
    pub fn authenticate_request_use_case(&self) -> AuthenticateRequestUseCase {
        AuthenticateRequestUseCase {
            token_service: self.token_service.clone(),
            validate_api_token_use_case: self.validate_api_token_use_case(),
            session_blocklist: self.session_blocklist.clone(),
        }
    }
}
