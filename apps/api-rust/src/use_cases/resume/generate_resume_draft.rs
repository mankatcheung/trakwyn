use std::sync::Arc;

use super::generate_resume::{GenerateResumeInput, GenerateResumeUseCase};
use crate::domain::document_draft::{DocumentDraft, DocumentDraftType};
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{
    ApplicationRepository, CreateDocumentDraftData, DocumentDraftRepository,
};
use crate::use_cases::shared::resume_to_tiptap_doc::resume_to_tiptap_doc;
use crate::use_cases::shared::token_limit::Now;

pub struct GenerateResumeDraftCommand {
    pub user_id: String,
    pub application_id: String,
}

/// Generates a tailored resume and keeps it, as a `DocumentDraft`.
///
/// Composes `GenerateResumeUseCase` rather than absorbing it, exactly as the
/// cover letter draft does: the model call keeps its own rate limiter,
/// prompt and grounding check, so there is no second path to the provider
/// that skips them.
///
/// The draft is created only after generation succeeds *and* passes the
/// grounding check, so a refused resume leaves nothing behind.
pub struct GenerateResumeDraftUseCase {
    pub generate_resume_use_case: GenerateResumeUseCase,
    pub document_draft_repository: Arc<dyn DocumentDraftRepository>,
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub generate_id: GenerateId,
    pub now: Now,
}

impl GenerateResumeDraftUseCase {
    pub async fn execute(
        &self,
        command: GenerateResumeDraftCommand,
    ) -> DomainResult<DocumentDraft> {
        let app = self
            .application_repository
            .find_by_id(&command.application_id)
            .await?
            .ok_or_else(|| DomainError::not_found("Application not found"))?;
        if app.user_id != command.user_id {
            return Err(DomainError::forbidden("Forbidden"));
        }

        let resume = self
            .generate_resume_use_case
            .execute(GenerateResumeInput {
                user_id: command.user_id,
                application_id: command.application_id.clone(),
            })
            .await?;
        let doc = resume_to_tiptap_doc(&resume);

        self.document_draft_repository
            .create(CreateDocumentDraftData {
                id: (self.generate_id)(),
                application_id: command.application_id,
                draft_type: DocumentDraftType::Resume,
                title: format!(
                    "{} — {} ({})",
                    app.company,
                    app.role,
                    (self.now)().format("%Y-%m-%d")
                ),
                content_json: Some(doc.content_json),
                plain_text: Some(doc.plain_text),
                source_document_id: None,
            })
            .await
    }
}
