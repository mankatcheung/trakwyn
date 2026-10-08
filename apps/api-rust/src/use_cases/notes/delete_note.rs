use std::sync::Arc;

use serde_json::json;

use crate::domain::activity_log::ActivityEventType;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{
    ActivityLogRepository, AppendActivityLogData, ApplicationRepository, NoteRepository,
};

pub struct DeleteNoteInput {
    pub user_id: String,
    pub note_id: String,
}

pub struct DeleteNoteUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub note_repository: Arc<dyn NoteRepository>,
    pub activity_log_repository: Arc<dyn ActivityLogRepository>,
    pub generate_id: GenerateId,
}

impl DeleteNoteUseCase {
    pub async fn execute(&self, input: DeleteNoteInput) -> DomainResult<()> {
        let note = self
            .note_repository
            .find_by_id(&input.note_id)
            .await?
            .ok_or_else(|| DomainError::not_found("Note not found"))?;

        let application = self.application_repository.find_by_id(&note.application_id).await?;
        if application.is_none_or(|application| application.user_id != input.user_id) {
            return Err(DomainError::forbidden("Forbidden"));
        }

        self.note_repository.delete(&input.note_id, &note.application_id).await?;

        self.activity_log_repository
            .append(AppendActivityLogData {
                id: (self.generate_id)(),
                application_id: note.application_id,
                actor_id: input.user_id,
                event_type: ActivityEventType::NoteDeleted,
                payload: json!({ "noteId": input.note_id }).to_string(),
            })
            .await?;

        Ok(())
    }
}
