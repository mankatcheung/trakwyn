use std::sync::Arc;

use serde_json::json;

use crate::domain::activity_log::ActivityEventType;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{
    ActivityLogRepository, AppendActivityLogData, ApplicationRepository, DocumentRepository,
    StorageProvider,
};

pub struct DeleteDocumentInput {
    pub user_id: String,
    pub document_id: String,
}

pub struct DeleteDocumentUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub document_repository: Arc<dyn DocumentRepository>,
    pub storage_provider: Arc<dyn StorageProvider>,
    pub activity_log_repository: Arc<dyn ActivityLogRepository>,
    pub generate_id: GenerateId,
}

impl DeleteDocumentUseCase {
    pub async fn execute(&self, input: DeleteDocumentInput) -> DomainResult<()> {
        let document = self
            .document_repository
            .find_by_id(&input.document_id)
            .await?
            .ok_or_else(|| DomainError::not_found("Document not found"))?;

        let application = self.application_repository.find_by_id(&document.application_id).await?;
        if application.is_none_or(|application| application.user_id != input.user_id) {
            return Err(DomainError::forbidden("Forbidden"));
        }

        // Storage first: a record without its file is the worse leftover.
        self.storage_provider.delete(&document.storage_key).await?;
        self.document_repository.delete(&input.document_id, &document.application_id).await?;

        self.activity_log_repository
            .append(AppendActivityLogData {
                id: (self.generate_id)(),
                application_id: document.application_id,
                actor_id: input.user_id,
                event_type: ActivityEventType::DocumentDeleted,
                payload: json!({ "documentId": input.document_id, "name": document.name })
                    .to_string(),
            })
            .await?;

        Ok(())
    }
}
