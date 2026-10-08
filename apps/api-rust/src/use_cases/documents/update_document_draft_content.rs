use std::sync::Arc;

use super::owned_draft::find_owned_draft;
use crate::domain::document_draft::DocumentDraft;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{
    ApplicationRepository, DocumentDraftRepository, UpdateDocumentDraftContentData,
};

pub struct UpdateDocumentDraftContentInput {
    pub user_id: String,
    pub draft_id: String,
    pub content_json: String,
    pub plain_text: String,
}

pub struct UpdateDocumentDraftContentUseCase {
    pub document_draft_repository: Arc<dyn DocumentDraftRepository>,
    pub application_repository: Arc<dyn ApplicationRepository>,
}

impl UpdateDocumentDraftContentUseCase {
    pub async fn execute(
        &self,
        input: UpdateDocumentDraftContentInput,
    ) -> DomainResult<DocumentDraft> {
        find_owned_draft(
            self.document_draft_repository.as_ref(),
            self.application_repository.as_ref(),
            &input.draft_id,
            &input.user_id,
        )
        .await?;

        self.document_draft_repository
            .update_content(
                &input.draft_id,
                UpdateDocumentDraftContentData {
                    content_json: input.content_json,
                    plain_text: input.plain_text,
                },
            )
            .await
    }
}
