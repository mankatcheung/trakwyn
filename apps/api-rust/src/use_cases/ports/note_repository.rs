use async_trait::async_trait;

use crate::domain::note::Note;
use crate::use_cases::errors::DomainResult;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateNoteData {
    pub id: String,
    pub application_id: String,
    pub content: String,
}

#[async_trait]
pub trait NoteRepository: Send + Sync {
    /// Newest first.
    async fn find_all_by_application_id(&self, application_id: &str) -> DomainResult<Vec<Note>>;
    async fn count_by_application_id(&self, application_id: &str) -> DomainResult<i64>;
    async fn find_by_id(&self, id: &str) -> DomainResult<Option<Note>>;
    async fn create(&self, data: CreateNoteData) -> DomainResult<Note>;
    async fn update(&self, id: &str, content: &str) -> DomainResult<Note>;
    /// `application_id` is the note's owner, passed so a caching decorator can
    /// invalidate that application's list without a lookup.
    async fn delete(&self, id: &str, application_id: &str) -> DomainResult<()>;
    /// The user's most recent notes on applications other than
    /// `exclude_application_id`, skipping trashed applications. Backs the
    /// opt-in cross-application context for cover letter generation.
    async fn find_recent_by_user_excluding_application(
        &self,
        user_id: &str,
        exclude_application_id: &str,
        limit: i64,
    ) -> DomainResult<Vec<Note>>;
}
