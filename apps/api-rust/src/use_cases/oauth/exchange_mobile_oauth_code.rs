use std::sync::Arc;

use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{MobileOAuthHandoffService, MobileOAuthTokens};

pub struct ExchangeMobileOAuthCodeInput {
    pub code: String,
    pub code_verifier: String,
}

pub struct ExchangeMobileOAuthCodeUseCase {
    pub mobile_oauth_handoff_service: Arc<dyn MobileOAuthHandoffService>,
}

impl ExchangeMobileOAuthCodeUseCase {
    pub async fn execute(
        &self,
        input: ExchangeMobileOAuthCodeInput,
    ) -> DomainResult<MobileOAuthTokens> {
        // The signature or expiry failure is infrastructure detail: to the
        // client this is just "that code doesn't work any more".
        self.mobile_oauth_handoff_service
            .verify(&input.code, &input.code_verifier)
            .map_err(|_| DomainError::unauthorized("Invalid or expired OAuth handoff code"))
    }
}
