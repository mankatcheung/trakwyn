use std::sync::Arc;

use crate::domain::note::Note;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{ApplicationRepository, NoteRepository};

pub struct UpdateNoteInput {
    pub user_id: String,
    pub note_id: String,
    pub content: String,
}

pub struct UpdateNoteUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub note_repository: Arc<dyn NoteRepository>,
}

impl UpdateNoteUseCase {
    pub async fn execute(&self, input: UpdateNoteInput) -> DomainResult<Note> {
        let note = self
            .note_repository
            .find_by_id(&input.note_id)
            .await?
            .ok_or_else(|| DomainError::not_found("Note not found"))?;

        // A note whose application is missing (or in Trash) is refused the
        // same way as someone else's, so the response does not say which.
        let application = self.application_repository.find_by_id(&note.application_id).await?;
        if application.is_none_or(|application| application.user_id != input.user_id) {
            return Err(DomainError::forbidden("Forbidden"));
        }

        self.note_repository.update(&input.note_id, &input.content).await
    }
}
