//! Caches user lookups by id and by email, as `apps/api`'s
//! `CachedUserRepository` does.
//!
//! An email can change, so `update` has to drop the cache entry of the old
//! one. The old email is remembered per user id in a bounded in-process map
//! (filled by every read and write that passes through this instance), exactly
//! as the original does; an id it does not know simply misses that one
//! invalidation and the stale entry expires through its TTL.

use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use chrono::{DateTime, Utc};

use super::cache_dto::{cached_option, UserDto};
use crate::domain::user::User;
use crate::infrastructure::cache::cache_keys::{user_by_email, user_by_id};
use crate::infrastructure::cache::constants::REVERSE_INDEX_MAX_ENTRIES;
use crate::infrastructure::cache::{BoundedMap, Cache};
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{CreateUserData, UpdateUserData, UserRepository};

pub struct CachedUserRepository {
    inner: Arc<dyn UserRepository>,
    cache: Arc<dyn Cache>,
    /// The last-cached email per user id. Never held across an await.
    email_by_user_id: Mutex<BoundedMap<String, String>>,
}

impl CachedUserRepository {
    pub fn new(inner: Arc<dyn UserRepository>, cache: Arc<dyn Cache>) -> Self {
        Self {
            inner,
            cache,
            email_by_user_id: Mutex::new(BoundedMap::new(REVERSE_INDEX_MAX_ENTRIES)),
        }
    }

    fn remember_email(&self, id: &str, email: &str) {
        if let Ok(mut map) = self.email_by_user_id.lock() {
            map.set(id.to_string(), email.to_string());
        }
    }

    fn known_email(&self, id: &str) -> Option<String> {
        self.email_by_user_id.lock().ok().and_then(|map| map.get(&id.to_string()).cloned())
    }

    fn forget_email(&self, id: &str) {
        if let Ok(mut map) = self.email_by_user_id.lock() {
            map.delete(&id.to_string());
        }
    }
}

#[async_trait]
impl UserRepository for CachedUserRepository {
    async fn find_by_id(&self, id: &str) -> DomainResult<Option<User>> {
        let result = cached_option::<UserDto, _, _>(&*self.cache, &user_by_id(id), || {
            self.inner.find_by_id(id)
        })
        .await?;
        if let Some(user) = &result {
            self.remember_email(id, &user.email);
        }
        Ok(result)
    }

    async fn find_by_email(&self, email: &str) -> DomainResult<Option<User>> {
        let result = cached_option::<UserDto, _, _>(&*self.cache, &user_by_email(email), || {
            self.inner.find_by_email(email)
        })
        .await?;
        if let Some(user) = &result {
            self.remember_email(&user.id, &user.email);
        }
        Ok(result)
    }

    /// Not cached: a low-frequency, rate-limited recovery path.
    async fn find_by_backup_email(&self, email: &str) -> DomainResult<Option<User>> {
        self.inner.find_by_backup_email(email).await
    }

    /// Not cached: only the weekly-digest batch job reads it.
    async fn find_all(&self) -> DomainResult<Vec<User>> {
        self.inner.find_all().await
    }

    async fn create(&self, data: CreateUserData) -> DomainResult<User> {
        let result = self.inner.create(data).await?;
        self.remember_email(&result.id, &result.email);
        // Registration and OAuth sign-up call `find_by_email` first to check
        // for a duplicate, which may have cached a "not found" for this email.
        self.cache.delete(&user_by_email(&result.email)).await;
        Ok(result)
    }

    async fn update(&self, id: &str, data: UpdateUserData) -> DomainResult<User> {
        let result = self.inner.update(id, data).await?;
        let old_email = self.known_email(id);
        self.cache.delete(&user_by_id(id)).await;
        self.cache.delete(&user_by_email(&result.email)).await;
        if let Some(old_email) = old_email.filter(|old| *old != result.email) {
            self.cache.delete(&user_by_email(&old_email)).await;
        }
        self.remember_email(id, &result.email);
        Ok(result)
    }

    async fn delete(&self, id: &str) -> DomainResult<()> {
        let email = self.known_email(id);
        self.inner.delete(id).await?;
        self.cache.delete(&user_by_id(id)).await;
        self.forget_email(id);
        if let Some(email) = email {
            self.cache.delete(&user_by_email(&email)).await;
        }
        Ok(())
    }

    /// Drops only the by-id entry, as the original does.
    async fn update_last_digest_sent_at(
        &self,
        id: &str,
        sent_at: DateTime<Utc>,
    ) -> DomainResult<()> {
        self.inner.update_last_digest_sent_at(id, sent_at).await?;
        self.cache.delete(&user_by_id(id)).await;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::cache::MemoryCache;
    use crate::use_cases::clock::now;
    use crate::use_cases::test_support::{user_with_email, FakeUserRepository};

    fn repository(users: Vec<User>) -> (Arc<FakeUserRepository>, CachedUserRepository) {
        let inner = Arc::new(FakeUserRepository::with(users));
        let cached = CachedUserRepository::new(inner.clone(), Arc::new(MemoryCache::default()));
        (inner, cached)
    }

    fn rename(name: &str) -> UpdateUserData {
        UpdateUserData { name: Some(Some(name.to_string())), ..Default::default() }
    }

    fn new_email(email: &str) -> UpdateUserData {
        UpdateUserData { email: Some(email.to_string()), ..Default::default() }
    }

    fn create_data(id: &str, email: &str) -> CreateUserData {
        CreateUserData { id: id.to_string(), email: email.to_string(), ..Default::default() }
    }

    #[tokio::test]
    async fn serves_repeated_lookups_from_the_cache() {
        let (inner, cached) = repository(vec![user_with_email("u1", "ada@example.com")]);
        cached.find_by_id("u1").await.unwrap();
        cached.find_by_email("ada@example.com").await.unwrap();

        inner.update("u1", rename("changed behind the cache")).await.unwrap();

        assert_eq!(cached.find_by_id("u1").await.unwrap().unwrap().name, None);
        assert_eq!(cached.find_by_email("ada@example.com").await.unwrap().unwrap().name, None);
    }

    #[tokio::test]
    async fn caches_an_unknown_user_as_unknown() {
        let (inner, cached) = repository(vec![]);
        assert_eq!(cached.find_by_id("u1").await.unwrap(), None);
        assert_eq!(cached.find_by_email("ada@example.com").await.unwrap(), None);

        inner.create(create_data("u1", "ada@example.com")).await.unwrap();

        assert_eq!(cached.find_by_id("u1").await.unwrap(), None);
        assert_eq!(cached.find_by_email("ada@example.com").await.unwrap(), None);
    }

    #[tokio::test]
    async fn keeps_a_users_timestamps_through_the_cache() {
        let mut user = user_with_email("u1", "ada@example.com");
        user.created_at = now();
        let (_, cached) = repository(vec![user.clone()]);
        cached.find_by_id("u1").await.unwrap();

        assert_eq!(cached.find_by_id("u1").await.unwrap(), Some(user));
    }

    #[tokio::test]
    async fn create_clears_a_cached_not_found_for_that_email() {
        let (_, cached) = repository(vec![]);
        assert_eq!(cached.find_by_email("ada@example.com").await.unwrap(), None);

        cached.create(create_data("u1", "ada@example.com")).await.unwrap();

        assert!(cached.find_by_email("ada@example.com").await.unwrap().is_some());
    }

    #[tokio::test]
    async fn update_invalidates_the_id_entry_and_the_email_entry() {
        let (_, cached) = repository(vec![user_with_email("u1", "ada@example.com")]);
        cached.find_by_id("u1").await.unwrap();
        cached.find_by_email("ada@example.com").await.unwrap();

        cached.update("u1", rename("Ada")).await.unwrap();

        let name = Some("Ada".to_string());
        assert_eq!(cached.find_by_id("u1").await.unwrap().unwrap().name, name);
        assert_eq!(cached.find_by_email("ada@example.com").await.unwrap().unwrap().name, name);
    }

    #[tokio::test]
    async fn a_changed_email_invalidates_the_old_and_the_new_entry() {
        let (_, cached) = repository(vec![user_with_email("u1", "old@example.com")]);
        cached.find_by_id("u1").await.unwrap();
        cached.find_by_email("old@example.com").await.unwrap();
        cached.find_by_email("new@example.com").await.unwrap();

        cached.update("u1", new_email("new@example.com")).await.unwrap();

        assert_eq!(cached.find_by_email("old@example.com").await.unwrap(), None);
        assert!(cached.find_by_email("new@example.com").await.unwrap().is_some());
    }

    #[tokio::test]
    async fn an_old_email_this_instance_never_saw_stays_cached() {
        let (_, cached) = repository(vec![user_with_email("u1", "old@example.com")]);
        // Cached under the old email by another instance sharing the cache.
        cached.find_by_email("old@example.com").await.unwrap();
        let fresh = CachedUserRepository::new(cached.inner.clone(), cached.cache.clone());

        fresh.update("u1", new_email("new@example.com")).await.unwrap();

        assert!(fresh.find_by_email("old@example.com").await.unwrap().is_some());
    }

    #[tokio::test]
    async fn delete_invalidates_the_id_entry_and_the_known_email_entry() {
        let (_, cached) = repository(vec![user_with_email("u1", "ada@example.com")]);
        cached.find_by_id("u1").await.unwrap();
        cached.find_by_email("ada@example.com").await.unwrap();

        cached.delete("u1").await.unwrap();

        assert_eq!(cached.find_by_id("u1").await.unwrap(), None);
        assert_eq!(cached.find_by_email("ada@example.com").await.unwrap(), None);
    }

    #[tokio::test]
    async fn a_digest_stamp_invalidates_the_id_entry_only() {
        let (_, cached) = repository(vec![user_with_email("u1", "ada@example.com")]);
        cached.find_by_id("u1").await.unwrap();
        cached.find_by_email("ada@example.com").await.unwrap();

        cached.update_last_digest_sent_at("u1", now()).await.unwrap();

        assert!(cached.find_by_id("u1").await.unwrap().unwrap().last_digest_sent_at.is_some());
        assert!(cached
            .find_by_email("ada@example.com")
            .await
            .unwrap()
            .unwrap()
            .last_digest_sent_at
            .is_none());
    }

    #[tokio::test]
    async fn the_batch_and_backup_email_reads_are_never_cached() {
        let (inner, cached) = repository(vec![]);
        assert!(cached.find_all().await.unwrap().is_empty());
        assert_eq!(cached.find_by_backup_email("b@example.com").await.unwrap(), None);

        let mut user = user_with_email("u1", "ada@example.com");
        user.backup_email = Some("b@example.com".to_string());
        inner.create(create_data("u1", "ada@example.com")).await.unwrap();
        inner
            .update(
                "u1",
                UpdateUserData {
                    backup_email: Some(Some("b@example.com".to_string())),
                    ..Default::default()
                },
            )
            .await
            .unwrap();

        assert_eq!(cached.find_all().await.unwrap().len(), 1);
        assert!(cached.find_by_backup_email("b@example.com").await.unwrap().is_some());
    }
}
