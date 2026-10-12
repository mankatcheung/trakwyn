use std::sync::Arc;

use super::owned_draft::find_owned_draft;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{ApplicationRepository, DocumentDraftRepository};

pub struct DeleteDocumentDraftInput {
    pub user_id: String,
    pub draft_id: String,
}

pub struct DeleteDocumentDraftUseCase {
    pub document_draft_repository: Arc<dyn DocumentDraftRepository>,
    pub application_repository: Arc<dyn ApplicationRepository>,
}

impl DeleteDocumentDraftUseCase {
    pub async fn execute(&self, input: DeleteDocumentDraftInput) -> DomainResult<()> {
        find_owned_draft(
            self.document_draft_repository.as_ref(),
            self.application_repository.as_ref(),
            &input.draft_id,
            &input.user_id,
        )
        .await?;

        self.document_draft_repository.delete(&input.draft_id).await
    }
}
