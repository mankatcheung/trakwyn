use std::sync::Arc;

use crate::domain::contact::Contact;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{ApplicationRepository, ContactRepository, CreateContactData};

#[derive(Debug, Clone, Default)]
pub struct CreateContactInput {
    pub user_id: String,
    pub application_id: String,
    pub name: String,
    pub role: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub linkedin_url: Option<String>,
    pub notes: Option<String>,
}

pub struct CreateContactUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub contact_repository: Arc<dyn ContactRepository>,
    pub generate_id: GenerateId,
}

impl CreateContactUseCase {
    pub async fn execute(&self, input: CreateContactInput) -> DomainResult<Contact> {
        let application = self
            .application_repository
            .find_by_id(&input.application_id)
            .await?
            .ok_or_else(|| DomainError::not_found("Application not found"))?;
        if application.user_id != input.user_id {
            return Err(DomainError::forbidden("Forbidden"));
        }

        self.contact_repository
            .create(CreateContactData {
                id: (self.generate_id)(),
                application_id: input.application_id,
                name: input.name,
                role: input.role,
                email: input.email,
                phone: input.phone,
                linkedin_url: input.linkedin_url,
                notes: input.notes,
            })
            .await
    }
}
