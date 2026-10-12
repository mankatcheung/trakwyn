pub mod create_note;
pub mod delete_note;
pub mod get_notes;
pub mod update_note;

pub use create_note::{CreateNoteInput, CreateNoteUseCase};
pub use delete_note::{DeleteNoteInput, DeleteNoteUseCase};
pub use get_notes::{GetNotesInput, GetNotesUseCase};
pub use update_note::{UpdateNoteInput, UpdateNoteUseCase};

#[cfg(test)]
mod tests;
