use std::sync::Arc;

use serde_json::json;

use super::document_validation::{
    assert_allowed_mime_type, assert_valid_size_bytes, is_owned_upload_key,
};
use crate::domain::activity_log::ActivityEventType;
use crate::domain::document::Document;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{
    ActivityLogRepository, AppendActivityLogData, ApplicationRepository, CreateDocumentData,
    DocumentRepository, StorageProvider,
};

#[derive(Debug, Clone)]
pub struct ConfirmDocumentInput {
    pub user_id: String,
    pub application_id: String,
    pub storage_key: String,
    pub name: String,
    pub mime_type: String,
    pub size_bytes: i32,
    pub document_type: Option<String>,
    pub version: Option<String>,
}

pub struct ConfirmDocumentUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub document_repository: Arc<dyn DocumentRepository>,
    pub activity_log_repository: Arc<dyn ActivityLogRepository>,
    pub storage_provider: Arc<dyn StorageProvider>,
    pub generate_id: GenerateId,
}

impl ConfirmDocumentUseCase {
    async fn create(&self, input: &ConfirmDocumentInput) -> DomainResult<Document> {
        assert_allowed_mime_type(&input.mime_type)?;
        assert_valid_size_bytes(input.size_bytes)?;

        let application = self
            .application_repository
            .find_by_id(&input.application_id)
            .await?
            .ok_or_else(|| DomainError::not_found("Application not found"))?;
        if application.user_id != input.user_id {
            return Err(DomainError::forbidden("Forbidden"));
        }

        self.document_repository
            .create(CreateDocumentData {
                id: (self.generate_id)(),
                application_id: input.application_id.clone(),
                storage_key: input.storage_key.clone(),
                name: input.name.clone(),
                mime_type: input.mime_type.clone(),
                size_bytes: input.size_bytes,
                document_type: input.document_type.clone(),
                version: input.version.clone(),
                source_draft_id: None,
            })
            .await
    }

    pub async fn execute(&self, input: ConfirmDocumentInput) -> DomainResult<Document> {
        let document = match self.create(&input).await {
            Ok(document) => document,
            Err(error) => {
                // The client uploads directly to storage before this database
                // step. Do not leave an orphaned blob when the quota or
                // another write fails.
                if is_owned_upload_key(&input.storage_key, &input.user_id, &input.application_id) {
                    // Ignored on purpose: the client is owed the original
                    // database or quota error, not the cleanup's.
                    let _ = self.storage_provider.delete(&input.storage_key).await;
                }
                return Err(error);
            }
        };

        self.activity_log_repository
            .append(AppendActivityLogData {
                id: (self.generate_id)(),
                application_id: input.application_id,
                actor_id: input.user_id,
                event_type: ActivityEventType::DocumentUploaded,
                payload: json!({ "documentId": document.id, "name": document.name }).to_string(),
            })
            .await?;

        Ok(document)
    }
}
