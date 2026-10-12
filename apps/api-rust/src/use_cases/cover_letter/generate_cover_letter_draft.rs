use std::sync::Arc;

use super::generate_cover_letter::{GenerateCoverLetterInput, GenerateCoverLetterUseCase};
use crate::domain::document_draft::{DocumentDraft, DocumentDraftType};
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{
    ApplicationRepository, CreateDocumentDraftData, DocumentDraftRepository,
};
use crate::use_cases::shared::prose_to_tiptap_doc::prose_to_tiptap_doc;
use crate::use_cases::shared::token_limit::Now;

pub struct GenerateCoverLetterDraftCommand {
    pub user_id: String,
    pub application_id: String,
    pub resume_text: Option<String>,
}

/// Generates a cover letter and keeps it, as a `DocumentDraft`.
///
/// Composes `GenerateCoverLetterUseCase` rather than absorbing it, so the
/// model call keeps its own rate limiter, prompt and AI-not-configured
/// handling: there is no second, ungoverned path to the provider.
///
/// The draft is only created if generation succeeded, so a rate limit or a
/// missing API key leaves nothing behind for the user to clean up.
pub struct GenerateCoverLetterDraftUseCase {
    pub generate_cover_letter_use_case: GenerateCoverLetterUseCase,
    pub document_draft_repository: Arc<dyn DocumentDraftRepository>,
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub generate_id: GenerateId,
    pub now: Now,
}

impl GenerateCoverLetterDraftUseCase {
    pub async fn execute(
        &self,
        command: GenerateCoverLetterDraftCommand,
    ) -> DomainResult<DocumentDraft> {
        // Checked here as well as inside the generation use case, so an
        // application belonging to someone else is refused before the model
        // runs and before anything is charged to the owner's API key.
        let app = self
            .application_repository
            .find_by_id(&command.application_id)
            .await?
            .ok_or_else(|| DomainError::not_found("Application not found"))?;
        if app.user_id != command.user_id {
            return Err(DomainError::forbidden("Forbidden"));
        }

        let letter = self
            .generate_cover_letter_use_case
            .execute(GenerateCoverLetterInput {
                user_id: command.user_id,
                application_id: command.application_id.clone(),
                resume_text: command.resume_text,
            })
            .await?;

        let doc = prose_to_tiptap_doc(&letter);

        self.document_draft_repository
            .create(CreateDocumentDraftData {
                id: (self.generate_id)(),
                application_id: command.application_id,
                draft_type: DocumentDraftType::CoverLetter,
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
