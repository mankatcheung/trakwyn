//! Caches the documents of one application, as `apps/api`'s
//! `CachedDocumentRepository` does: the list and the by-id lookup.

use std::sync::Arc;

use async_trait::async_trait;

use super::cache_dto::{cached_list, cached_option, DocumentDto};
use crate::domain::document::Document;
use crate::infrastructure::cache::cache_keys::{doc_by_id, doc_list};
use crate::infrastructure::cache::Cache;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{CreateDocumentData, DocumentRepository};

pub struct CachedDocumentRepository {
    inner: Arc<dyn DocumentRepository>,
    cache: Arc<dyn Cache>,
}

impl CachedDocumentRepository {
    pub fn new(inner: Arc<dyn DocumentRepository>, cache: Arc<dyn Cache>) -> Self {
        Self { inner, cache }
    }
}

#[async_trait]
impl DocumentRepository for CachedDocumentRepository {
    async fn find_all_by_application_id(
        &self,
        application_id: &str,
    ) -> DomainResult<Vec<Document>> {
        cached_list::<DocumentDto, _, _>(&*self.cache, &doc_list(application_id), || {
            self.inner.find_all_by_application_id(application_id)
        })
        .await
    }

    async fn count_by_application_id(&self, application_id: &str) -> DomainResult<i64> {
        self.inner.count_by_application_id(application_id).await
    }

    /// Not cached: it reads across every application of the user, which the
    /// per-application keys cannot invalidate.
    async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<Document>> {
        self.inner.find_all_by_user_id(user_id).await
    }

    async fn find_by_id(&self, id: &str) -> DomainResult<Option<Document>> {
        cached_option::<DocumentDto, _, _>(&*self.cache, &doc_by_id(id), || {
            self.inner.find_by_id(id)
        })
        .await
    }

    async fn create(&self, data: CreateDocumentData) -> DomainResult<Document> {
        let result = self.inner.create(data).await?;
        self.cache.delete(&doc_list(&result.application_id)).await;
        Ok(result)
    }

    async fn delete(&self, id: &str, application_id: &str) -> DomainResult<()> {
        self.inner.delete(id, application_id).await?;
        self.cache.delete(&doc_by_id(id)).await;
        self.cache.delete(&doc_list(application_id)).await;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::cache::MemoryCache;
    use crate::use_cases::clock::now;
    use crate::use_cases::test_support::FakeDocumentRepository;

    fn data(id: &str, application_id: &str) -> CreateDocumentData {
        CreateDocumentData {
            id: id.to_string(),
            application_id: application_id.to_string(),
            name: "resume.pdf".to_string(),
            mime_type: "application/pdf".to_string(),
            size_bytes: 1024,
            storage_key: format!("key-{id}"),
            ..CreateDocumentData::default()
        }
    }

    fn document(id: &str, application_id: &str) -> Document {
        Document {
            id: id.to_string(),
            application_id: application_id.to_string(),
            name: "resume.pdf".to_string(),
            mime_type: "application/pdf".to_string(),
            size_bytes: 1024,
            storage_key: format!("key-{id}"),
            document_type: "resume".to_string(),
            version: None,
            source_draft_id: None,
            created_at: now(),
        }
    }

    fn repository(
        documents: Vec<Document>,
    ) -> (Arc<FakeDocumentRepository>, CachedDocumentRepository) {
        let inner = Arc::new(FakeDocumentRepository::with(documents));
        let cached = CachedDocumentRepository::new(inner.clone(), Arc::new(MemoryCache::default()));
        (inner, cached)
    }

    #[tokio::test]
    async fn serves_repeated_reads_from_the_cache() {
        let (inner, cached) = repository(vec![document("d1", "a1")]);
        cached.find_all_by_application_id("a1").await.unwrap();
        cached.find_by_id("d1").await.unwrap();

        inner.create(data("d2", "a1")).await.unwrap();
        inner.delete("d1", "a1").await.unwrap();

        assert_eq!(cached.find_all_by_application_id("a1").await.unwrap().len(), 1);
        assert!(cached.find_by_id("d1").await.unwrap().is_some());
    }

    #[tokio::test]
    async fn caches_a_missing_document_as_missing() {
        let (inner, cached) = repository(vec![]);
        assert_eq!(cached.find_by_id("d1").await.unwrap(), None);
        inner.create(data("d1", "a1")).await.unwrap();
        assert_eq!(cached.find_by_id("d1").await.unwrap(), None);
    }

    #[tokio::test]
    async fn create_invalidates_the_list() {
        let (_, cached) = repository(vec![document("d1", "a1")]);
        cached.find_all_by_application_id("a1").await.unwrap();

        cached.create(data("d2", "a1")).await.unwrap();

        assert_eq!(cached.find_all_by_application_id("a1").await.unwrap().len(), 2);
    }

    #[tokio::test]
    async fn delete_invalidates_the_document_and_the_list() {
        let (_, cached) = repository(vec![document("d1", "a1")]);
        cached.find_by_id("d1").await.unwrap();
        cached.find_all_by_application_id("a1").await.unwrap();

        cached.delete("d1", "a1").await.unwrap();

        assert_eq!(cached.find_by_id("d1").await.unwrap(), None);
        assert!(cached.find_all_by_application_id("a1").await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn the_count_and_the_per_user_read_are_never_cached() {
        let inner =
            Arc::new(FakeDocumentRepository::with(vec![document("d1", "a1")]).owned_by("a1", "u1"));
        let cached = CachedDocumentRepository::new(inner.clone(), Arc::new(MemoryCache::default()));
        assert_eq!(cached.count_by_application_id("a1").await.unwrap(), 1);
        assert_eq!(cached.find_all_by_user_id("u1").await.unwrap().len(), 1);

        inner.create(data("d2", "a1")).await.unwrap();

        assert_eq!(cached.count_by_application_id("a1").await.unwrap(), 2);
        assert_eq!(cached.find_all_by_user_id("u1").await.unwrap().len(), 2);
    }
}
