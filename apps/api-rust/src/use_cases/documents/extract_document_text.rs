use std::sync::Arc;

use futures::future::BoxFuture;

use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{
    ApplicationRepository, DocumentRepository, DocumentTextExtractor, StorageProvider,
};

/// Reads the bytes behind a URL the storage provider handed out. The
/// original calls the runtime's global `fetch` here; a use case names no
/// HTTP client, so the call is injected. It fails with an internal error
/// (`Failed to read the document file`) for an answer that is not 2xx.
///
/// The original bounds neither the wait nor the size of the body, and
/// neither does this use case.
pub type FetchStoredObject =
    Arc<dyn Fn(String) -> BoxFuture<'static, DomainResult<Vec<u8>>> + Send + Sync>;

pub struct ExtractDocumentTextInput {
    pub user_id: String,
    pub document_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExtractDocumentTextOutput {
    pub text: String,
}

pub struct ExtractDocumentTextUseCase {
    pub document_repository: Arc<dyn DocumentRepository>,
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub document_text_extractor: Arc<dyn DocumentTextExtractor>,
    pub storage_provider: Arc<dyn StorageProvider>,
    pub fetch_stored_object: FetchStoredObject,
}

impl ExtractDocumentTextUseCase {
    pub async fn execute(
        &self,
        input: ExtractDocumentTextInput,
    ) -> DomainResult<ExtractDocumentTextOutput> {
        let document = self
            .document_repository
            .find_by_id(&input.document_id)
            .await?
            .ok_or_else(|| DomainError::not_found("Document not found"))?;

        let application = self.application_repository.find_by_id(&document.application_id).await?;
        if application.is_none_or(|application| application.user_id != input.user_id) {
            return Err(DomainError::forbidden("Not authorized"));
        }

        let signed_url = self.storage_provider.get_signed_url(&document.storage_key, None).await?;
        let bytes = (self.fetch_stored_object)(signed_url).await?;
        let text = self.document_text_extractor.extract(bytes, &document.mime_type).await?;

        Ok(ExtractDocumentTextOutput { text })
    }
}
