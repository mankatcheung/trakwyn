use crate::domain::document_draft::DocumentDraft;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{ApplicationRepository, DocumentDraftRepository};

/// The draft, once it is known to sit on one of the user's applications: the
/// check every single-draft use case opens with. A missing draft is
/// `NOT_FOUND`; a draft on someone else's application, or on one that is
/// gone or in Trash, is `FORBIDDEN`.
pub async fn find_owned_draft(
    document_draft_repository: &dyn DocumentDraftRepository,
    application_repository: &dyn ApplicationRepository,
    draft_id: &str,
    user_id: &str,
) -> DomainResult<DocumentDraft> {
    let draft = document_draft_repository
        .find_by_id(draft_id)
        .await?
        .ok_or_else(|| DomainError::not_found("Document draft not found"))?;

    let application = application_repository.find_by_id(&draft.application_id).await?;
    if application.is_none_or(|application| application.user_id != user_id) {
        return Err(DomainError::forbidden("Not authorized"));
    }

    Ok(draft)
}
