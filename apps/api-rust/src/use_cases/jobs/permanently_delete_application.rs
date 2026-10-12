use std::sync::Arc;

use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::storage_provider::StorageProvider;
use crate::use_cases::ports::{ApplicationRepository, DocumentRepository};

pub struct PermanentlyDeleteApplicationInput {
    pub user_id: String,
    pub application_id: String,
}

/// The only path that actually destroys an application, used both by "Delete
/// permanently" in Trash and by the nightly purge: one implementation rather
/// than two that drift apart.
///
/// Blobs go before rows. Reversing that order loses the storage keys to the
/// cascade and orphans the files, which nothing would ever notice.
///
/// The purge passes the owner's own id rather than skipping the check, so
/// there is no code path here that deletes without establishing ownership.
#[derive(Clone)]
pub struct PermanentlyDeleteApplicationUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub document_repository: Arc<dyn DocumentRepository>,
    pub storage_provider: Arc<dyn StorageProvider>,
}

impl PermanentlyDeleteApplicationUseCase {
    pub async fn execute(&self, input: PermanentlyDeleteApplicationInput) -> DomainResult<()> {
        let application = self
            .application_repository
            .find_by_id_including_trashed(&input.application_id)
            .await?
            .ok_or_else(|| DomainError::not_found("Application not found"))?;
        if application.user_id != input.user_id {
            return Err(DomainError::forbidden("Forbidden"));
        }

        let documents =
            self.document_repository.find_all_by_application_id(&input.application_id).await?;
        let keys: Vec<String> =
            documents.into_iter().map(|document| document.storage_key).collect();
        self.storage_provider.delete_many(&keys).await?;

        self.application_repository.delete(&input.application_id).await
    }
}
