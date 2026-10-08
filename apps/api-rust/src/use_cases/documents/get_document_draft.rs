use std::sync::Arc;

use super::owned_draft::find_owned_draft;
use crate::domain::document_draft::DocumentDraft;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{ApplicationRepository, DocumentDraftRepository};

pub struct GetDocumentDraftInput {
    pub user_id: String,
    pub draft_id: String,
}

pub struct GetDocumentDraftUseCase {
    pub document_draft_repository: Arc<dyn DocumentDraftRepository>,
    pub application_repository: Arc<dyn ApplicationRepository>,
}

impl GetDocumentDraftUseCase {
    pub async fn execute(&self, input: GetDocumentDraftInput) -> DomainResult<DocumentDraft> {
        find_owned_draft(
            self.document_draft_repository.as_ref(),
            self.application_repository.as_ref(),
            &input.draft_id,
            &input.user_id,
        )
        .await
    }
}
