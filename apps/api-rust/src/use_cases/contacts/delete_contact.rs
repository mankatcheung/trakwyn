use std::sync::Arc;

use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{ApplicationRepository, ContactRepository};

pub struct DeleteContactInput {
    pub user_id: String,
    pub contact_id: String,
}

pub struct DeleteContactUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub contact_repository: Arc<dyn ContactRepository>,
}

impl DeleteContactUseCase {
    pub async fn execute(&self, input: DeleteContactInput) -> DomainResult<()> {
        let contact = self
            .contact_repository
            .find_by_id(&input.contact_id)
            .await?
            .ok_or_else(|| DomainError::not_found("Contact not found"))?;

        let application = self.application_repository.find_by_id(&contact.application_id).await?;
        if application.is_none_or(|application| application.user_id != input.user_id) {
            return Err(DomainError::forbidden("Forbidden"));
        }

        self.contact_repository.delete(&input.contact_id, &contact.application_id).await
    }
}
