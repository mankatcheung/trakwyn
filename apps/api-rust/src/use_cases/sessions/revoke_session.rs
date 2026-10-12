use std::sync::Arc;

use crate::domain::security_event::SecurityEventType;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{
    CreateSecurityEventData, SecurityEventRepository, SessionRepository,
};

pub struct RevokeSessionInput {
    pub session_id: String,
    pub user_id: String,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
}

pub struct RevokeSessionUseCase {
    pub session_repository: Arc<dyn SessionRepository>,
    pub security_event_repository: Arc<dyn SecurityEventRepository>,
    pub generate_id: GenerateId,
}

impl RevokeSessionUseCase {
    pub async fn execute(&self, input: RevokeSessionInput) -> DomainResult<()> {
        self.session_repository
            .find_by_id_and_user_id(&input.session_id, &input.user_id)
            .await?
            .ok_or_else(|| DomainError::not_found("Session not found"))?;
        self.session_repository.revoke(&input.session_id).await?;

        self.security_event_repository
            .create(CreateSecurityEventData {
                id: (self.generate_id)(),
                user_id: input.user_id,
                event_type: SecurityEventType::SessionRevoked,
                ip_address: input.ip_address,
                user_agent: input.user_agent,
            })
            .await?;
        Ok(())
    }
}
