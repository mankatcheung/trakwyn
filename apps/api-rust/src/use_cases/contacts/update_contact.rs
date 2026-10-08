use std::sync::Arc;

use crate::domain::contact::Contact;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{ApplicationRepository, ContactRepository, UpdateContactData};

/// A field left `None` is not written; `Some(None)` clears a nullable one.
#[derive(Debug, Clone, Default)]
pub struct UpdateContactInput {
    pub user_id: String,
    pub contact_id: String,
    pub name: Option<String>,
    pub role: Option<Option<String>>,
    pub email: Option<Option<String>>,
    pub phone: Option<Option<String>>,
    pub linkedin_url: Option<Option<String>>,
    pub notes: Option<Option<String>>,
}

pub struct UpdateContactUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub contact_repository: Arc<dyn ContactRepository>,
}

impl UpdateContactUseCase {
    pub async fn execute(&self, input: UpdateContactInput) -> DomainResult<Contact> {
        let contact = self
            .contact_repository
            .find_by_id(&input.contact_id)
            .await?
            .ok_or_else(|| DomainError::not_found("Contact not found"))?;

        // A contact whose application is missing (or in Trash) is refused the
        // same way as someone else's, so the response does not say which.
        let application = self.application_repository.find_by_id(&contact.application_id).await?;
        if application.is_none_or(|application| application.user_id != input.user_id) {
            return Err(DomainError::forbidden("Forbidden"));
        }

        self.contact_repository
            .update(
                &input.contact_id,
                UpdateContactData {
                    name: input.name,
                    role: input.role,
                    email: input.email,
                    phone: input.phone,
                    linkedin_url: input.linkedin_url,
                    notes: input.notes,
                },
            )
            .await
    }
}
