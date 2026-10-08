use std::sync::Arc;

use crate::domain::security_event::SecurityEventType;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{
    CreateSecurityEventData, SecurityEventRepository, SessionRepository,
};

pub struct RevokeOtherSessionsInput {
    pub user_id: String,
    pub current_session_id: String,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
}

pub struct RevokeOtherSessionsUseCase {
    pub session_repository: Arc<dyn SessionRepository>,
    pub security_event_repository: Arc<dyn SecurityEventRepository>,
    pub generate_id: GenerateId,
}

impl RevokeOtherSessionsUseCase {
    pub async fn execute(&self, input: RevokeOtherSessionsInput) -> DomainResult<()> {
        self.session_repository
            .revoke_all_for_user_except(&input.user_id, &input.current_session_id)
            .await?;

        self.security_event_repository
            .create(CreateSecurityEventData {
                id: (self.generate_id)(),
                user_id: input.user_id,
                event_type: SecurityEventType::OtherSessionsRevoked,
                ip_address: input.ip_address,
                user_agent: input.user_agent,
            })
            .await?;
        Ok(())
    }
}
