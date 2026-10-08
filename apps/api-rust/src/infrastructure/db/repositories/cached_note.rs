//! Caches the notes of one application, as `apps/api`'s `CachedNoteRepository`
//! does: the list and the by-id lookup. Counts and the cross-application read
//! pass straight through.

use std::sync::Arc;

use async_trait::async_trait;

use super::cache_dto::{cached_list, cached_option, NoteDto};
use crate::domain::note::Note;
use crate::infrastructure::cache::cache_keys::{note_by_id, note_list};
use crate::infrastructure::cache::Cache;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{CreateNoteData, NoteRepository};

pub struct CachedNoteRepository {
    inner: Arc<dyn NoteRepository>,
    cache: Arc<dyn Cache>,
}

impl CachedNoteRepository {
    pub fn new(inner: Arc<dyn NoteRepository>, cache: Arc<dyn Cache>) -> Self {
        Self { inner, cache }
    }
}

#[async_trait]
impl NoteRepository for CachedNoteRepository {
    async fn find_all_by_application_id(&self, application_id: &str) -> DomainResult<Vec<Note>> {
        cached_list::<NoteDto, _, _>(&*self.cache, &note_list(application_id), || {
            self.inner.find_all_by_application_id(application_id)
        })
        .await
    }

    /// Not cached: a single `COUNT(*)` is not worth a key and an invalidation path.
    async fn count_by_application_id(&self, application_id: &str) -> DomainResult<i64> {
        self.inner.count_by_application_id(application_id).await
    }

    async fn find_by_id(&self, id: &str) -> DomainResult<Option<Note>> {
        cached_option::<NoteDto, _, _>(&*self.cache, &note_by_id(id), || self.inner.find_by_id(id))
            .await
    }

    async fn create(&self, data: CreateNoteData) -> DomainResult<Note> {
        let result = self.inner.create(data).await?;
        self.cache.delete(&note_list(&result.application_id)).await;
        Ok(result)
    }

    async fn update(&self, id: &str, content: &str) -> DomainResult<Note> {
        let result = self.inner.update(id, content).await?;
        self.cache.delete(&note_by_id(id)).await;
        self.cache.delete(&note_list(&result.application_id)).await;
        Ok(result)
    }

    async fn delete(&self, id: &str, application_id: &str) -> DomainResult<()> {
        self.inner.delete(id, application_id).await?;
        self.cache.delete(&note_by_id(id)).await;
        self.cache.delete(&note_list(application_id)).await;
        Ok(())
    }

    /// Not cached: it spans the user's other applications, so there is no
    /// single key to invalidate on every note write.
    async fn find_recent_by_user_excluding_application(
        &self,
        user_id: &str,
        exclude_application_id: &str,
        limit: i64,
    ) -> DomainResult<Vec<Note>> {
        self.inner
            .find_recent_by_user_excluding_application(user_id, exclude_application_id, limit)
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::cache::MemoryCache;
    use crate::use_cases::clock::now;
    use crate::use_cases::test_support::FakeNoteRepository;

    fn note(id: &str, application_id: &str) -> Note {
        Note {
            id: id.to_string(),
            application_id: application_id.to_string(),
            content: format!("content of {id}"),
            created_at: now(),
            updated_at: now(),
        }
    }

    fn create_data(id: &str, application_id: &str) -> CreateNoteData {
        CreateNoteData {
            id: id.to_string(),
            application_id: application_id.to_string(),
            content: "new".to_string(),
        }
    }

    /// The fake is returned too, to change the database behind the cache's back.
    fn repository(notes: Vec<Note>) -> (Arc<FakeNoteRepository>, CachedNoteRepository) {
        let inner = Arc::new(FakeNoteRepository::with(notes));
        let cached = CachedNoteRepository::new(inner.clone(), Arc::new(MemoryCache::default()));
        (inner, cached)
    }

    #[tokio::test]
    async fn serves_a_repeated_list_from_the_cache() {
        let (inner, cached) = repository(vec![note("n1", "a1")]);
        assert_eq!(cached.find_all_by_application_id("a1").await.unwrap().len(), 1);

        inner.create(create_data("n2", "a1")).await.unwrap();

        assert_eq!(cached.find_all_by_application_id("a1").await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn keeps_one_list_per_application() {
        let (inner, cached) = repository(vec![note("n1", "a1")]);
        cached.find_all_by_application_id("a1").await.unwrap();
        inner.create(create_data("n2", "a2")).await.unwrap();

        assert_eq!(cached.find_all_by_application_id("a2").await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn serves_a_repeated_lookup_by_id_from_the_cache() {
        let (inner, cached) = repository(vec![note("n1", "a1")]);
        let first = cached.find_by_id("n1").await.unwrap();

        inner.delete("n1", "a1").await.unwrap();

        assert_eq!(cached.find_by_id("n1").await.unwrap(), first);
        assert!(first.is_some());
    }

    #[tokio::test]
    async fn caches_a_missing_note_as_missing() {
        let (inner, cached) = repository(vec![]);
        assert_eq!(cached.find_by_id("n1").await.unwrap(), None);

        inner.create(create_data("n1", "a1")).await.unwrap();

        assert_eq!(cached.find_by_id("n1").await.unwrap(), None);
    }

    #[tokio::test]
    async fn create_invalidates_the_applications_list() {
        let (_, cached) = repository(vec![note("n1", "a1")]);
        cached.find_all_by_application_id("a1").await.unwrap();

        cached.create(create_data("n2", "a1")).await.unwrap();

        assert_eq!(cached.find_all_by_application_id("a1").await.unwrap().len(), 2);
    }

    #[tokio::test]
    async fn update_invalidates_the_note_and_the_list() {
        let (_, cached) = repository(vec![note("n1", "a1")]);
        cached.find_by_id("n1").await.unwrap();
        cached.find_all_by_application_id("a1").await.unwrap();

        cached.update("n1", "edited").await.unwrap();

        assert_eq!(cached.find_by_id("n1").await.unwrap().unwrap().content, "edited");
        assert_eq!(cached.find_all_by_application_id("a1").await.unwrap()[0].content, "edited");
    }

    #[tokio::test]
    async fn delete_invalidates_the_note_and_the_list() {
        let (_, cached) = repository(vec![note("n1", "a1")]);
        cached.find_by_id("n1").await.unwrap();
        cached.find_all_by_application_id("a1").await.unwrap();

        cached.delete("n1", "a1").await.unwrap();

        assert_eq!(cached.find_by_id("n1").await.unwrap(), None);
        assert!(cached.find_all_by_application_id("a1").await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_write_leaves_other_applications_lists_alone() {
        let (inner, cached) = repository(vec![note("n1", "a1"), note("n2", "a2")]);
        cached.find_all_by_application_id("a2").await.unwrap();
        inner.create(create_data("n3", "a2")).await.unwrap();

        cached.create(create_data("n4", "a1")).await.unwrap();

        assert_eq!(cached.find_all_by_application_id("a2").await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn counts_and_the_cross_application_read_are_never_cached() {
        let (inner, cached) = repository(vec![note("n1", "a1")]);
        assert_eq!(cached.count_by_application_id("a1").await.unwrap(), 1);
        assert_eq!(
            cached.find_recent_by_user_excluding_application("u1", "a2", 10).await.unwrap().len(),
            1
        );

        inner.create(create_data("n2", "a1")).await.unwrap();

        assert_eq!(cached.count_by_application_id("a1").await.unwrap(), 2);
        assert_eq!(
            cached.find_recent_by_user_excluding_application("u1", "a2", 10).await.unwrap().len(),
            2
        );
    }

    #[tokio::test]
    async fn a_failed_write_invalidates_nothing() {
        let (_, cached) = repository(vec![note("n1", "a1")]);
        cached.find_by_id("n1").await.unwrap();

        assert!(cached.update("missing", "x").await.is_err());

        assert!(cached.find_by_id("n1").await.unwrap().is_some());
    }
}
