use async_trait::async_trait;

use crate::domain::document::Document;
use crate::use_cases::errors::DomainResult;

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct CreateDocumentData {
    pub id: String,
    pub application_id: String,
    pub name: String,
    pub mime_type: String,
    pub size_bytes: i32,
    pub storage_key: String,
    /// `None` stores `document_limits::DEFAULT_DOCUMENT_TYPE`.
    pub document_type: Option<String>,
    pub version: Option<String>,
    pub source_draft_id: Option<String>,
}

#[async_trait]
pub trait DocumentRepository: Send + Sync {
    /// Newest first.
    async fn find_all_by_application_id(&self, application_id: &str)
        -> DomainResult<Vec<Document>>;
    async fn count_by_application_id(&self, application_id: &str) -> DomainResult<i64>;
    /// Every document across every application owned by the user, newest
    /// first, for cross-application aggregation (e.g. resume-version outcome
    /// correlation).
    async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<Document>>;
    async fn find_by_id(&self, id: &str) -> DomainResult<Option<Document>>;
    /// Reserves a slot in the application's document quota and inserts, in
    /// one transaction. Fails with `QUOTA_EXCEEDED` when the application
    /// already holds `document_limits::DOCUMENTS_PER_APPLICATION`.
    async fn create(&self, data: CreateDocumentData) -> DomainResult<Document>;
    /// Deletes and frees the quota slot. `application_id` is the document's
    /// owner, passed so a caching decorator can invalidate that application's
    /// list without a lookup.
    async fn delete(&self, id: &str, application_id: &str) -> DomainResult<()>;
}
