//! Caches the contacts of one application, as `apps/api`'s
//! `CachedContactRepository` does: the list and the by-id lookup.

use std::sync::Arc;

use async_trait::async_trait;

use super::cache_dto::{cached_list, cached_option, ContactDto};
use crate::domain::contact::Contact;
use crate::infrastructure::cache::cache_keys::{contact_by_id, contact_list};
use crate::infrastructure::cache::Cache;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{ContactRepository, CreateContactData, UpdateContactData};

pub struct CachedContactRepository {
    inner: Arc<dyn ContactRepository>,
    cache: Arc<dyn Cache>,
}

impl CachedContactRepository {
    pub fn new(inner: Arc<dyn ContactRepository>, cache: Arc<dyn Cache>) -> Self {
        Self { inner, cache }
    }
}

#[async_trait]
impl ContactRepository for CachedContactRepository {
    async fn find_all_by_application_id(&self, application_id: &str) -> DomainResult<Vec<Contact>> {
        cached_list::<ContactDto, _, _>(&*self.cache, &contact_list(application_id), || {
            self.inner.find_all_by_application_id(application_id)
        })
        .await
    }

    /// Not cached: a single `COUNT(*)` is not worth a key and an invalidation path.
    async fn count_by_application_id(&self, application_id: &str) -> DomainResult<i64> {
        self.inner.count_by_application_id(application_id).await
    }

    async fn find_by_id(&self, id: &str) -> DomainResult<Option<Contact>> {
        cached_option::<ContactDto, _, _>(&*self.cache, &contact_by_id(id), || {
            self.inner.find_by_id(id)
        })
        .await
    }

    async fn create(&self, data: CreateContactData) -> DomainResult<Contact> {
        let result = self.inner.create(data).await?;
        self.cache.delete(&contact_list(&result.application_id)).await;
        Ok(result)
    }

    async fn update(&self, id: &str, data: UpdateContactData) -> DomainResult<Contact> {
        let result = self.inner.update(id, data).await?;
        self.cache.delete(&contact_by_id(id)).await;
        self.cache.delete(&contact_list(&result.application_id)).await;
        Ok(result)
    }

    async fn delete(&self, id: &str, application_id: &str) -> DomainResult<()> {
        self.inner.delete(id, application_id).await?;
        self.cache.delete(&contact_by_id(id)).await;
        self.cache.delete(&contact_list(application_id)).await;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::cache::MemoryCache;
    use crate::use_cases::clock::now;
    use crate::use_cases::test_support::FakeContactRepository;

    fn contact(id: &str, application_id: &str) -> Contact {
        Contact {
            id: id.to_string(),
            application_id: application_id.to_string(),
            name: format!("name of {id}"),
            role: None,
            email: None,
            phone: None,
            linkedin_url: None,
            notes: None,
            created_at: now(),
            updated_at: now(),
        }
    }

    fn create_data(id: &str, application_id: &str) -> CreateContactData {
        CreateContactData {
            id: id.to_string(),
            application_id: application_id.to_string(),
            name: "new".to_string(),
            ..Default::default()
        }
    }

    fn repository(contacts: Vec<Contact>) -> (Arc<FakeContactRepository>, CachedContactRepository) {
        let inner = Arc::new(FakeContactRepository::with(contacts));
        let cached = CachedContactRepository::new(inner.clone(), Arc::new(MemoryCache::default()));
        (inner, cached)
    }

    #[tokio::test]
    async fn serves_repeated_reads_from_the_cache() {
        let (inner, cached) = repository(vec![contact("c1", "a1")]);
        cached.find_all_by_application_id("a1").await.unwrap();
        cached.find_by_id("c1").await.unwrap();

        inner.create(create_data("c2", "a1")).await.unwrap();
        inner.delete("c1", "a1").await.unwrap();

        assert_eq!(cached.find_all_by_application_id("a1").await.unwrap().len(), 1);
        assert!(cached.find_by_id("c1").await.unwrap().is_some());
    }

    #[tokio::test]
    async fn caches_a_missing_contact_as_missing() {
        let (inner, cached) = repository(vec![]);
        assert_eq!(cached.find_by_id("c1").await.unwrap(), None);
        inner.create(create_data("c1", "a1")).await.unwrap();
        assert_eq!(cached.find_by_id("c1").await.unwrap(), None);
    }

    #[tokio::test]
    async fn create_invalidates_the_list() {
        let (_, cached) = repository(vec![contact("c1", "a1")]);
        cached.find_all_by_application_id("a1").await.unwrap();

        cached.create(create_data("c2", "a1")).await.unwrap();

        assert_eq!(cached.find_all_by_application_id("a1").await.unwrap().len(), 2);
    }

    #[tokio::test]
    async fn update_invalidates_the_contact_and_the_list() {
        let (_, cached) = repository(vec![contact("c1", "a1")]);
        cached.find_by_id("c1").await.unwrap();
        cached.find_all_by_application_id("a1").await.unwrap();

        let update = UpdateContactData { name: Some("renamed".to_string()), ..Default::default() };
        cached.update("c1", update).await.unwrap();

        assert_eq!(cached.find_by_id("c1").await.unwrap().unwrap().name, "renamed");
        assert_eq!(cached.find_all_by_application_id("a1").await.unwrap()[0].name, "renamed");
    }

    #[tokio::test]
    async fn delete_invalidates_the_contact_and_the_list() {
        let (_, cached) = repository(vec![contact("c1", "a1")]);
        cached.find_by_id("c1").await.unwrap();
        cached.find_all_by_application_id("a1").await.unwrap();

        cached.delete("c1", "a1").await.unwrap();

        assert_eq!(cached.find_by_id("c1").await.unwrap(), None);
        assert!(cached.find_all_by_application_id("a1").await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn the_count_is_never_cached() {
        let (inner, cached) = repository(vec![contact("c1", "a1")]);
        assert_eq!(cached.count_by_application_id("a1").await.unwrap(), 1);
        inner.create(create_data("c2", "a1")).await.unwrap();
        assert_eq!(cached.count_by_application_id("a1").await.unwrap(), 2);
    }
}
