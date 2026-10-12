use async_trait::async_trait;

use crate::domain::document_draft::{DocumentDraft, DocumentDraftType};
use crate::use_cases::errors::DomainResult;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateDocumentDraftData {
    pub id: String,
    pub application_id: String,
    pub draft_type: DocumentDraftType,
    pub title: String,
    /// `None` stores `{}`.
    pub content_json: Option<String>,
    /// `None` stores the empty string.
    pub plain_text: Option<String>,
    pub source_document_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpdateDocumentDraftContentData {
    pub content_json: String,
    pub plain_text: String,
}

#[async_trait]
pub trait DocumentDraftRepository: Send + Sync {
    /// Most recently updated first.
    async fn find_all_by_application_id(
        &self,
        application_id: &str,
    ) -> DomainResult<Vec<DocumentDraft>>;
    async fn count_by_application_id(&self, application_id: &str) -> DomainResult<i64>;
    async fn find_by_id(&self, id: &str) -> DomainResult<Option<DocumentDraft>>;
    async fn create(&self, data: CreateDocumentDraftData) -> DomainResult<DocumentDraft>;
    async fn update_content(
        &self,
        id: &str,
        data: UpdateDocumentDraftContentData,
    ) -> DomainResult<DocumentDraft>;
    async fn rename(&self, id: &str, title: &str) -> DomainResult<DocumentDraft>;
    async fn delete(&self, id: &str) -> DomainResult<()>;
    /// The user's most recently updated cover letter drafts on applications
    /// other than `exclude_application_id` (JEF-249), skipping trashed
    /// applications. Backs the opt-in cross-application context fed into
    /// cover letter generation.
    async fn find_recent_cover_letters_by_user_excluding_application(
        &self,
        user_id: &str,
        exclude_application_id: &str,
        limit: i64,
    ) -> DomainResult<Vec<DocumentDraft>>;
}
