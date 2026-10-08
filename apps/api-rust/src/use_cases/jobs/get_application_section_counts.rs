use std::sync::Arc;

use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{
    ApplicationRepository, ContactRepository, DocumentDraftRepository, DocumentRepository,
    InterviewRoundRepository, NoteRepository, OfferRepository,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ApplicationSectionCounts {
    pub notes: i64,
    pub interviews: i64,
    pub contacts: i64,
    pub documents: i64,
    pub document_drafts: i64,
    pub offers: i64,
}

pub struct GetApplicationSectionCountsInput {
    pub user_id: String,
    pub application_id: String,
}

/// How much is in each section of an application, for the detail page's index.
///
/// The index exists so you can tell an empty section from a full one without
/// opening it, which means every section reports a number, zero included
/// (JEF-208).
///
/// Ownership is checked once, up front, so a refused application costs no
/// counting queries at all.
pub struct GetApplicationSectionCountsUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub note_repository: Arc<dyn NoteRepository>,
    pub interview_round_repository: Arc<dyn InterviewRoundRepository>,
    pub contact_repository: Arc<dyn ContactRepository>,
    pub offer_repository: Arc<dyn OfferRepository>,
    pub document_repository: Arc<dyn DocumentRepository>,
    pub document_draft_repository: Arc<dyn DocumentDraftRepository>,
}

impl GetApplicationSectionCountsUseCase {
    pub async fn execute(
        &self,
        input: GetApplicationSectionCountsInput,
    ) -> DomainResult<ApplicationSectionCounts> {
        // find_by_id filters trashed applications out, so a trashed one
        // reports as missing rather than serving counts.
        let application = self
            .application_repository
            .find_by_id(&input.application_id)
            .await?
            .ok_or_else(|| DomainError::not_found("Application not found"))?;
        if application.user_id != input.user_id {
            return Err(DomainError::forbidden("Forbidden"));
        }

        let id = input.application_id.as_str();
        let (notes, interviews, contacts, documents, document_drafts, offers) = tokio::try_join!(
            self.note_repository.count_by_application_id(id),
            self.interview_round_repository.count_by_application_id(id),
            self.contact_repository.count_by_application_id(id),
            self.document_repository.count_by_application_id(id),
            self.document_draft_repository.count_by_application_id(id),
            self.offer_repository.count_by_application_id(id),
        )?;

        Ok(ApplicationSectionCounts {
            notes,
            interviews,
            contacts,
            documents,
            document_drafts,
            offers,
        })
    }
}
