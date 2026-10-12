use std::cmp::Reverse;
use std::collections::HashMap;
use std::sync::Mutex;

use async_trait::async_trait;

use crate::domain::document::Document;
use crate::use_cases::clock::now;
use crate::use_cases::constants::document_limits::{
    DEFAULT_DOCUMENT_TYPE, DOCUMENTS_PER_APPLICATION,
};
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{CreateDocumentData, DocumentRepository};

/// Keeps the per-application quota counter the SQL repository keeps on
/// `JobApplication.documentCount`. It knows which user owns an application
/// only when told through [`FakeDocumentRepository::owned_by`].
#[derive(Default)]
pub struct FakeDocumentRepository {
    documents: Mutex<Vec<Document>>,
    counts: Mutex<HashMap<String, i32>>,
    owners: Mutex<HashMap<String, String>>,
}

impl FakeDocumentRepository {
    /// Seeds documents, counting each against its application's quota.
    pub fn with(documents: Vec<Document>) -> Self {
        let mut counts = HashMap::new();
        for document in &documents {
            *counts.entry(document.application_id.clone()).or_insert(0) += 1;
        }
        Self {
            documents: Mutex::new(documents),
            counts: Mutex::new(counts),
            owners: Mutex::default(),
        }
    }

    /// Records that `application_id` belongs to `user_id`, for
    /// `find_all_by_user_id`.
    pub fn owned_by(self, application_id: &str, user_id: &str) -> Self {
        self.owners.lock().unwrap().insert(application_id.to_string(), user_id.to_string());
        self
    }

    pub fn all(&self) -> Vec<Document> {
        self.documents.lock().unwrap().clone()
    }

    /// The quota counter for an application.
    pub fn document_count(&self, application_id: &str) -> i32 {
        self.counts.lock().unwrap().get(application_id).copied().unwrap_or(0)
    }
}

#[async_trait]
impl DocumentRepository for FakeDocumentRepository {
    async fn find_all_by_application_id(
        &self,
        application_id: &str,
    ) -> DomainResult<Vec<Document>> {
        let mut documents: Vec<Document> = self
            .all()
            .into_iter()
            .filter(|document| document.application_id == application_id)
            .collect();
        documents.sort_by_key(|document| Reverse(document.created_at));
        Ok(documents)
    }

    async fn count_by_application_id(&self, application_id: &str) -> DomainResult<i64> {
        Ok(self.find_all_by_application_id(application_id).await?.len() as i64)
    }

    async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<Document>> {
        let owners = self.owners.lock().unwrap().clone();
        let mut documents: Vec<Document> = self
            .all()
            .into_iter()
            .filter(|document| {
                owners.get(&document.application_id).is_some_and(|owner| owner == user_id)
            })
            .collect();
        documents.sort_by_key(|document| Reverse(document.created_at));
        Ok(documents)
    }

    async fn find_by_id(&self, id: &str) -> DomainResult<Option<Document>> {
        Ok(self.all().into_iter().find(|document| document.id == id))
    }

    async fn create(&self, data: CreateDocumentData) -> DomainResult<Document> {
        let mut documents = self.documents.lock().unwrap();
        let mut counts = self.counts.lock().unwrap();

        let count = counts.entry(data.application_id.clone()).or_insert(0);
        if *count >= DOCUMENTS_PER_APPLICATION {
            return Err(DomainError::quota_exceeded(format!(
                "This application already has the maximum of {DOCUMENTS_PER_APPLICATION} documents"
            )));
        }
        // The unique constraints; the transaction leaves the counter alone.
        if documents.iter().any(|document| document.id == data.id) {
            return Err(DomainError::internal("duplicate key value: Document_pkey"));
        }
        if documents.iter().any(|document| document.storage_key == data.storage_key) {
            return Err(DomainError::internal("duplicate key value: Document_storageKey_unique"));
        }
        *count += 1;

        let document = Document {
            id: data.id,
            application_id: data.application_id,
            name: data.name,
            mime_type: data.mime_type,
            size_bytes: data.size_bytes,
            storage_key: data.storage_key,
            document_type: data.document_type.unwrap_or_else(|| DEFAULT_DOCUMENT_TYPE.to_string()),
            version: data.version,
            source_draft_id: data.source_draft_id,
            created_at: now(),
        };
        documents.push(document.clone());
        Ok(document)
    }

    async fn delete(&self, id: &str, _application_id: &str) -> DomainResult<()> {
        let mut documents = self.documents.lock().unwrap();
        let Some(position) = documents.iter().position(|document| document.id == id) else {
            return Ok(());
        };
        let deleted = documents.remove(position);
        if let Some(count) = self.counts.lock().unwrap().get_mut(&deleted.application_id) {
            *count = (*count - 1).max(0);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::use_cases::errors::ErrorCode;

    fn data(id: &str) -> CreateDocumentData {
        CreateDocumentData {
            id: id.to_string(),
            application_id: "app-1".to_string(),
            name: "resume.pdf".to_string(),
            mime_type: "application/pdf".to_string(),
            size_bytes: 1024,
            storage_key: format!("key-{id}"),
            ..CreateDocumentData::default()
        }
    }

    #[tokio::test]
    async fn enforces_the_quota_and_frees_a_slot_on_delete() {
        let documents = FakeDocumentRepository::default();
        for index in 0..DOCUMENTS_PER_APPLICATION {
            documents.create(data(&format!("doc-{index}"))).await.unwrap();
        }

        let err = documents.create(data("one-too-many")).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::QuotaExceeded);
        assert_eq!(err.to_string(), "This application already has the maximum of 10 documents");

        documents.delete("doc-0", "app-1").await.unwrap();
        documents.create(data("fits-again")).await.unwrap();
        assert_eq!(documents.document_count("app-1"), DOCUMENTS_PER_APPLICATION);
    }

    #[tokio::test]
    async fn a_duplicate_storage_key_fails_without_taking_a_slot() {
        let documents = FakeDocumentRepository::default();
        documents.create(data("doc-1")).await.unwrap();

        let duplicate =
            CreateDocumentData { storage_key: "key-doc-1".to_string(), ..data("doc-2") };
        assert!(matches!(documents.create(duplicate).await, Err(DomainError::Internal(_))));
        assert_eq!(documents.document_count("app-1"), 1);
    }

    #[tokio::test]
    async fn lists_by_user_only_for_applications_it_was_told_about() {
        let documents = FakeDocumentRepository::default().owned_by("app-1", "user-1");
        let created = documents.create(data("doc-1")).await.unwrap();

        assert_eq!(created.document_type, "other");
        assert_eq!(documents.find_all_by_user_id("user-1").await.unwrap(), vec![created]);
        assert!(documents.find_all_by_user_id("user-2").await.unwrap().is_empty());
    }
}
