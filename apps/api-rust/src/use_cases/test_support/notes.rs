use std::cmp::Reverse;
use std::sync::Mutex;

use async_trait::async_trait;

use crate::domain::note::Note;
use crate::use_cases::clock::now;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{CreateNoteData, NoteRepository};

#[derive(Default)]
pub struct FakeNoteRepository {
    notes: Mutex<Vec<Note>>,
}

impl FakeNoteRepository {
    pub fn with(notes: Vec<Note>) -> Self {
        Self { notes: Mutex::new(notes) }
    }

    pub fn all(&self) -> Vec<Note> {
        self.notes.lock().unwrap().clone()
    }
}

#[async_trait]
impl NoteRepository for FakeNoteRepository {
    async fn find_all_by_application_id(&self, application_id: &str) -> DomainResult<Vec<Note>> {
        let mut notes: Vec<Note> =
            self.all().into_iter().filter(|note| note.application_id == application_id).collect();
        notes.sort_by_key(|note| Reverse(note.created_at));
        Ok(notes)
    }

    async fn count_by_application_id(&self, application_id: &str) -> DomainResult<i64> {
        Ok(self.find_all_by_application_id(application_id).await?.len() as i64)
    }

    async fn find_by_id(&self, id: &str) -> DomainResult<Option<Note>> {
        Ok(self.all().into_iter().find(|note| note.id == id))
    }

    async fn create(&self, data: CreateNoteData) -> DomainResult<Note> {
        let timestamp = now();
        let note = Note {
            id: data.id,
            application_id: data.application_id,
            content: data.content,
            created_at: timestamp,
            updated_at: timestamp,
        };
        self.notes.lock().unwrap().push(note.clone());
        Ok(note)
    }

    async fn update(&self, id: &str, content: &str) -> DomainResult<Note> {
        let mut notes = self.notes.lock().unwrap();
        let position = notes
            .iter()
            .position(|note| note.id == id)
            .ok_or_else(|| DomainError::not_found("Note not found"))?;
        let updated =
            Note { content: content.to_string(), updated_at: now(), ..notes[position].clone() };
        notes[position] = updated.clone();
        Ok(updated)
    }

    async fn delete(&self, id: &str, _application_id: &str) -> DomainResult<()> {
        self.notes.lock().unwrap().retain(|note| note.id != id);
        Ok(())
    }

    async fn find_recent_by_user_excluding_application(
        &self,
        _user_id: &str,
        exclude_application_id: &str,
        limit: i64,
    ) -> DomainResult<Vec<Note>> {
        // The fake holds no application ownership, so it filters on the
        // excluded application only; the SQL repository test covers the join.
        let mut notes: Vec<Note> = self
            .all()
            .into_iter()
            .filter(|note| note.application_id != exclude_application_id)
            .collect();
        notes.sort_by_key(|note| Reverse(note.created_at));
        notes.truncate(limit.max(0) as usize);
        Ok(notes)
    }
}
