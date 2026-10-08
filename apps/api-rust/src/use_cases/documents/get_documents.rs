use std::sync::Arc;

use crate::domain::document::Document;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{ApplicationRepository, DocumentRepository};

pub struct GetDocumentsInput {
    pub user_id: String,
    pub application_id: String,
}

pub struct GetDocumentsUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub document_repository: Arc<dyn DocumentRepository>,
}

impl GetDocumentsUseCase {
    pub async fn execute(&self, input: GetDocumentsInput) -> DomainResult<Vec<Document>> {
        let application = self
            .application_repository
            .find_by_id(&input.application_id)
            .await?
            .ok_or_else(|| DomainError::not_found("Application not found"))?;
        if application.user_id != input.user_id {
            return Err(DomainError::forbidden("Forbidden"));
        }

        self.document_repository.find_all_by_application_id(&input.application_id).await
    }
}
