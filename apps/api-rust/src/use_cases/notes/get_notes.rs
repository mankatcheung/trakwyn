use std::sync::Arc;

use crate::domain::note::Note;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{ApplicationRepository, NoteRepository};

pub struct GetNotesInput {
    pub user_id: String,
    pub application_id: String,
}

pub struct GetNotesUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub note_repository: Arc<dyn NoteRepository>,
}

impl GetNotesUseCase {
    pub async fn execute(&self, input: GetNotesInput) -> DomainResult<Vec<Note>> {
        let application = self
            .application_repository
            .find_by_id(&input.application_id)
            .await?
            .ok_or_else(|| DomainError::not_found("Application not found"))?;
        if application.user_id != input.user_id {
            return Err(DomainError::forbidden("Forbidden"));
        }

        self.note_repository.find_all_by_application_id(&input.application_id).await
    }
}
