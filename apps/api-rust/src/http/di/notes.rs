use crate::http::container::Container;
use crate::use_cases::notes::{
    CreateNoteUseCase, DeleteNoteUseCase, GetNotesUseCase, UpdateNoteUseCase,
};

impl Container {
    pub fn create_note_use_case(&self) -> CreateNoteUseCase {
        CreateNoteUseCase {
            application_repository: self.application_repository.clone(),
            note_repository: self.note_repository.clone(),
            activity_log_repository: self.activity_log_repository.clone(),
            generate_id: self.generate_id.clone(),
        }
    }

    pub fn get_notes_use_case(&self) -> GetNotesUseCase {
        GetNotesUseCase {
            application_repository: self.application_repository.clone(),
            note_repository: self.note_repository.clone(),
        }
    }

    pub fn update_note_use_case(&self) -> UpdateNoteUseCase {
        UpdateNoteUseCase {
            application_repository: self.application_repository.clone(),
            note_repository: self.note_repository.clone(),
        }
    }

    pub fn delete_note_use_case(&self) -> DeleteNoteUseCase {
        DeleteNoteUseCase {
            application_repository: self.application_repository.clone(),
            note_repository: self.note_repository.clone(),
            activity_log_repository: self.activity_log_repository.clone(),
            generate_id: self.generate_id.clone(),
        }
    }
}
