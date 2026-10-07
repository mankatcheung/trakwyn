use std::sync::Arc;

use crate::domain::contact::Contact;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{ApplicationRepository, ContactRepository};

pub struct GetContactsInput {
    pub user_id: String,
    pub application_id: String,
}

pub struct GetContactsUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub contact_repository: Arc<dyn ContactRepository>,
}

impl GetContactsUseCase {
    pub async fn execute(&self, input: GetContactsInput) -> DomainResult<Vec<Contact>> {
        let application = self
            .application_repository
            .find_by_id(&input.application_id)
            .await?
            .ok_or_else(|| DomainError::not_found("Application not found"))?;
        if application.user_id != input.user_id {
            return Err(DomainError::forbidden("Forbidden"));
        }

        self.contact_repository.find_all_by_application_id(&input.application_id).await
    }
}
