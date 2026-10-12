use std::sync::Arc;

use serde_json::json;

use crate::domain::activity_log::ActivityEventType;
use crate::domain::note::Note;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{
    ActivityLogRepository, AppendActivityLogData, ApplicationRepository, CreateNoteData,
    NoteRepository,
};

pub struct CreateNoteInput {
    pub user_id: String,
    pub application_id: String,
    pub content: String,
}

pub struct CreateNoteUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub note_repository: Arc<dyn NoteRepository>,
    pub activity_log_repository: Arc<dyn ActivityLogRepository>,
    pub generate_id: GenerateId,
}

impl CreateNoteUseCase {
    pub async fn execute(&self, input: CreateNoteInput) -> DomainResult<Note> {
        let application = self
            .application_repository
            .find_by_id(&input.application_id)
            .await?
            .ok_or_else(|| DomainError::not_found("Application not found"))?;
        if application.user_id != input.user_id {
            return Err(DomainError::forbidden("Forbidden"));
        }

        let note = self
            .note_repository
            .create(CreateNoteData {
                id: (self.generate_id)(),
                application_id: input.application_id.clone(),
                content: input.content,
            })
            .await?;

        self.activity_log_repository
            .append(AppendActivityLogData {
                id: (self.generate_id)(),
                application_id: input.application_id,
                actor_id: input.user_id,
                event_type: ActivityEventType::NoteAdded,
                payload: json!({ "noteId": note.id }).to_string(),
            })
            .await?;

        Ok(note)
    }
}
