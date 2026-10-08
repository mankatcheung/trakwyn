use std::sync::Arc;

use crate::domain::document_draft::{DocumentDraft, DocumentDraftType};
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{
    ApplicationRepository, CreateDocumentDraftData, DocumentDraftRepository,
};

pub struct CreateDocumentDraftInput {
    pub user_id: String,
    pub application_id: String,
    pub draft_type: DocumentDraftType,
    pub title: String,
    pub content_json: Option<String>,
    pub plain_text: Option<String>,
    pub source_document_id: Option<String>,
}

pub struct CreateDocumentDraftUseCase {
    pub document_draft_repository: Arc<dyn DocumentDraftRepository>,
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub generate_id: GenerateId,
}

impl CreateDocumentDraftUseCase {
    pub async fn execute(&self, input: CreateDocumentDraftInput) -> DomainResult<DocumentDraft> {
        // Someone else's application is reported as missing, not forbidden.
        let application = self.application_repository.find_by_id(&input.application_id).await?;
        if application.is_none_or(|application| application.user_id != input.user_id) {
            return Err(DomainError::not_found("Application not found"));
        }

        self.document_draft_repository
            .create(CreateDocumentDraftData {
                id: (self.generate_id)(),
                application_id: input.application_id,
                draft_type: input.draft_type,
                title: input.title,
                content_json: input.content_json,
                plain_text: input.plain_text,
                source_document_id: input.source_document_id,
            })
            .await
    }
}
