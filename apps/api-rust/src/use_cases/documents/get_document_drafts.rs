use std::sync::Arc;

use crate::domain::document_draft::DocumentDraft;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{ApplicationRepository, DocumentDraftRepository};

pub struct GetDocumentDraftsInput {
    pub user_id: String,
    pub application_id: String,
}

pub struct GetDocumentDraftsUseCase {
    pub document_draft_repository: Arc<dyn DocumentDraftRepository>,
    pub application_repository: Arc<dyn ApplicationRepository>,
}

impl GetDocumentDraftsUseCase {
    pub async fn execute(&self, input: GetDocumentDraftsInput) -> DomainResult<Vec<DocumentDraft>> {
        // Someone else's application is reported as missing, not forbidden.
        let application = self.application_repository.find_by_id(&input.application_id).await?;
        if application.is_none_or(|application| application.user_id != input.user_id) {
            return Err(DomainError::not_found("Application not found"));
        }

        self.document_draft_repository.find_all_by_application_id(&input.application_id).await
    }
}
