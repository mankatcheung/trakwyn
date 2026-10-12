use std::sync::Arc;

use super::js_whitespace::js_trim;
use super::owned_draft::find_owned_draft;
use crate::domain::document_draft::DocumentDraft;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{ApplicationRepository, DocumentDraftRepository};

pub struct RenameDocumentDraftInput {
    pub user_id: String,
    pub draft_id: String,
    pub title: String,
}

/// Separate from `UpdateDocumentDraftContentUseCase` on purpose: the editor
/// saves content as the user types, and shipping the title along with every
/// one of those writes would make a rename indistinguishable from an
/// autosave, including when a stale editor tab overwrites a rename made
/// elsewhere.
pub struct RenameDocumentDraftUseCase {
    pub document_draft_repository: Arc<dyn DocumentDraftRepository>,
    pub application_repository: Arc<dyn ApplicationRepository>,
}

impl RenameDocumentDraftUseCase {
    pub async fn execute(&self, input: RenameDocumentDraftInput) -> DomainResult<DocumentDraft> {
        let title = js_trim(&input.title);
        if title.is_empty() {
            return Err(DomainError::validation("Title is required"));
        }

        find_owned_draft(
            self.document_draft_repository.as_ref(),
            self.application_repository.as_ref(),
            &input.draft_id,
            &input.user_id,
        )
        .await?;

        self.document_draft_repository.rename(&input.draft_id, title).await
    }
}
