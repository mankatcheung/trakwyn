//! Caches the API-token lookups every authenticated request performs, as
//! `apps/api`'s `CachedApiTokenRepository` does: the per-user list, the by-id
//! row and the by-hash row (with the owner's email).
//!
//! The by-hash entry uses the default TTL, as in the original; only the MCP
//! token cache has the short `TOKEN_TTL`. Revocation reaches it through
//! `delete`, which drops the by-hash key.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use async_trait::async_trait;

use super::cache_dto::{cached_list, cached_option, ApiTokenDto, ApiTokenWithUserEmailDto};
use crate::domain::api_token::ApiToken;
use crate::infrastructure::cache::cache_keys::{
    api_token_by_hash, api_token_by_id, api_token_last_used, api_token_list,
};
use crate::infrastructure::cache::constants::TOKEN_LAST_USED_TTL;
use crate::infrastructure::cache::{Cache, CacheExt};
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{ApiTokenRepository, ApiTokenWithUserEmail, CreateApiTokenData};

pub struct CachedApiTokenRepository {
    inner: Arc<dyn ApiTokenRepository>,
    cache: Arc<dyn Cache>,
}

impl CachedApiTokenRepository {
    pub fn new(inner: Arc<dyn ApiTokenRepository>, cache: Arc<dyn Cache>) -> Self {
        Self { inner, cache }
    }
}

#[async_trait]
impl ApiTokenRepository for CachedApiTokenRepository {
    async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<ApiToken>> {
        cached_list::<ApiTokenDto, _, _>(&*self.cache, &api_token_list(user_id), || {
            self.inner.find_all_by_user_id(user_id)
        })
        .await
    }

    async fn find_by_id(&self, id: &str) -> DomainResult<Option<ApiToken>> {
        cached_option::<ApiTokenDto, _, _>(&*self.cache, &api_token_by_id(id), || {
            self.inner.find_by_id(id)
        })
        .await
    }

    async fn find_by_token_hash(
        &self,
        token_hash: &str,
    ) -> DomainResult<Option<ApiTokenWithUserEmail>> {
        cached_option::<ApiTokenWithUserEmailDto, _, _>(
            &*self.cache,
            &api_token_by_hash(token_hash),
            || self.inner.find_by_token_hash(token_hash),
        )
        .await
    }

    async fn find_by_id_and_user_id(
        &self,
        id: &str,
        user_id: &str,
    ) -> DomainResult<Option<ApiToken>> {
        self.inner.find_by_id_and_user_id(id, user_id).await
    }

    async fn create(&self, data: CreateApiTokenData) -> DomainResult<ApiToken> {
        let result = self.inner.create(data).await?;
        self.cache.delete(&api_token_list(&result.user_id)).await;
        Ok(result)
    }

    /// Not invalidated: it fires on every validated request, so busting
    /// by-hash or by-id here would defeat caching them. Throttled instead to
    /// one write per token per window: the first caller in a window populates
    /// the marker key and writes, the rest find the key and skip the database.
    async fn update_last_used(&self, id: &str) -> DomainResult<()> {
        let first_in_window = AtomicBool::new(false);
        self.cache
            .get_or_set::<i64, _, _>(
                &api_token_last_used(id),
                || async {
                    first_in_window.store(true, Ordering::SeqCst);
                    Ok(1)
                },
                Some(TOKEN_LAST_USED_TTL),
            )
            .await?;
        if first_in_window.load(Ordering::SeqCst) {
            self.inner.update_last_used(id).await?;
        }
        Ok(())
    }

    /// The row is looked up through this repository's own cached `find_by_id`
    /// (shared through Redis), so the hash and list keys are dropped even when
    /// the read and the delete land on different instances.
    async fn delete(&self, id: &str) -> DomainResult<()> {
        let existing = self.find_by_id(id).await?;
        self.inner.delete(id).await?;
        self.cache.delete(&api_token_by_id(id)).await;
        if let Some(existing) = existing {
            self.cache.delete(&api_token_by_hash(&existing.token_hash)).await;
            self.cache.delete(&api_token_list(&existing.user_id)).await;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::AtomicUsize;

    use super::*;
    use crate::domain::api_token::ApiTokenScope;
    use crate::infrastructure::cache::MemoryCache;
    use crate::use_cases::clock::now;
    use crate::use_cases::test_support::FakeApiTokenRepository;

    /// The fake, with `update_last_used` calls that reach it counted.
    struct Counting {
        inner: FakeApiTokenRepository,
        last_used_writes: AtomicUsize,
    }

    #[async_trait]
    impl ApiTokenRepository for Counting {
        async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<ApiToken>> {
            self.inner.find_all_by_user_id(user_id).await
        }
        async fn find_by_id(&self, id: &str) -> DomainResult<Option<ApiToken>> {
            self.inner.find_by_id(id).await
        }
        async fn find_by_token_hash(
            &self,
            token_hash: &str,
        ) -> DomainResult<Option<ApiTokenWithUserEmail>> {
            self.inner.find_by_token_hash(token_hash).await
        }
        async fn create(&self, data: CreateApiTokenData) -> DomainResult<ApiToken> {
            self.inner.create(data).await
        }
        async fn update_last_used(&self, id: &str) -> DomainResult<()> {
            self.last_used_writes.fetch_add(1, Ordering::SeqCst);
            self.inner.update_last_used(id).await
        }
        async fn delete(&self, id: &str) -> DomainResult<()> {
            self.inner.delete(id).await
        }
        async fn find_by_id_and_user_id(
            &self,
            id: &str,
            user_id: &str,
        ) -> DomainResult<Option<ApiToken>> {
            self.inner.find_by_id_and_user_id(id, user_id).await
        }
    }

    fn token(id: &str, user_id: &str) -> ApiToken {
        ApiToken {
            id: id.to_string(),
            user_id: user_id.to_string(),
            name: format!("token {id}"),
            token_hash: format!("hash-{id}"),
            scope: ApiTokenScope::Full,
            last_used_at: None,
            created_at: now(),
        }
    }

    fn create_data(id: &str, user_id: &str) -> CreateApiTokenData {
        CreateApiTokenData {
            id: id.to_string(),
            user_id: user_id.to_string(),
            name: "new".to_string(),
            token_hash: format!("hash-{id}"),
            scope: ApiTokenScope::Read,
        }
    }

    fn repository(tokens: Vec<ApiToken>) -> (Arc<Counting>, CachedApiTokenRepository) {
        let inner = Arc::new(Counting {
            inner: FakeApiTokenRepository::with(tokens).with_user("u1", "ada@example.com"),
            last_used_writes: AtomicUsize::new(0),
        });
        let cached = CachedApiTokenRepository::new(inner.clone(), Arc::new(MemoryCache::default()));
        (inner, cached)
    }

    #[tokio::test]
    async fn serves_repeated_reads_from_the_cache() {
        let (inner, cached) = repository(vec![token("t1", "u1")]);
        cached.find_all_by_user_id("u1").await.unwrap();
        let by_hash = cached.find_by_token_hash("hash-t1").await.unwrap();
        cached.find_by_id("t1").await.unwrap();

        inner.create(create_data("t2", "u1")).await.unwrap();
        inner.delete("t1").await.unwrap();

        assert_eq!(cached.find_all_by_user_id("u1").await.unwrap().len(), 1);
        assert_eq!(cached.find_by_token_hash("hash-t1").await.unwrap(), by_hash);
        assert_eq!(by_hash.unwrap().user_email, "ada@example.com");
        assert!(cached.find_by_id("t1").await.unwrap().is_some());
    }

    #[tokio::test]
    async fn caches_an_unknown_token_as_unknown() {
        let (inner, cached) = repository(vec![]);
        assert_eq!(cached.find_by_token_hash("hash-t1").await.unwrap(), None);
        assert_eq!(cached.find_by_id("t1").await.unwrap(), None);

        inner.create(create_data("t1", "u1")).await.unwrap();

        assert_eq!(cached.find_by_token_hash("hash-t1").await.unwrap(), None);
        assert_eq!(cached.find_by_id("t1").await.unwrap(), None);
    }

    #[tokio::test]
    async fn create_invalidates_only_the_users_list() {
        let (_, cached) = repository(vec![token("t1", "u1")]);
        cached.find_all_by_user_id("u1").await.unwrap();
        cached.find_by_token_hash("hash-t2").await.unwrap();

        cached.create(create_data("t2", "u1")).await.unwrap();

        assert_eq!(cached.find_all_by_user_id("u1").await.unwrap().len(), 2);
        // The cached "no such hash" is deliberately left, as in the original.
        assert_eq!(cached.find_by_token_hash("hash-t2").await.unwrap(), None);
    }

    #[tokio::test]
    async fn update_last_used_writes_once_per_window_and_invalidates_nothing() {
        let (inner, cached) = repository(vec![token("t1", "u1"), token("t2", "u1")]);
        cached.find_by_token_hash("hash-t1").await.unwrap();
        cached.find_by_id("t1").await.unwrap();

        for _ in 0..5 {
            cached.update_last_used("t1").await.unwrap();
        }
        assert_eq!(inner.last_used_writes.load(Ordering::SeqCst), 1);
        cached.update_last_used("t2").await.unwrap();
        assert_eq!(inner.last_used_writes.load(Ordering::SeqCst), 2);

        // Still the row cached before the write.
        assert!(cached.find_by_id("t1").await.unwrap().unwrap().last_used_at.is_none());
        assert!(inner.find_by_id("t1").await.unwrap().unwrap().last_used_at.is_some());
    }

    #[tokio::test]
    async fn delete_invalidates_by_id_by_hash_and_the_list() {
        let (_, cached) = repository(vec![token("t1", "u1")]);
        cached.find_by_id("t1").await.unwrap();
        cached.find_by_token_hash("hash-t1").await.unwrap();
        cached.find_all_by_user_id("u1").await.unwrap();

        cached.delete("t1").await.unwrap();

        assert_eq!(cached.find_by_id("t1").await.unwrap(), None);
        assert_eq!(cached.find_by_token_hash("hash-t1").await.unwrap(), None);
        assert!(cached.find_all_by_user_id("u1").await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn delete_finds_the_hash_even_when_this_instance_never_read_the_token() {
        let inner = Arc::new(Counting {
            inner: FakeApiTokenRepository::with(vec![token("t1", "u1")])
                .with_user("u1", "ada@example.com"),
            last_used_writes: AtomicUsize::new(0),
        });
        let shared: Arc<dyn Cache> = Arc::new(MemoryCache::default());
        let reader = CachedApiTokenRepository::new(inner.clone(), shared.clone());
        let deleter = CachedApiTokenRepository::new(inner.clone(), shared);
        reader.find_by_token_hash("hash-t1").await.unwrap();
        reader.find_all_by_user_id("u1").await.unwrap();

        deleter.delete("t1").await.unwrap();

        assert_eq!(reader.find_by_token_hash("hash-t1").await.unwrap(), None);
        assert!(reader.find_all_by_user_id("u1").await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn deleting_an_unknown_token_still_reaches_the_inner_repository() {
        let (_, cached) = repository(vec![]);
        cached.delete("nope").await.unwrap();
    }

    #[tokio::test]
    async fn the_ownership_lookup_is_never_cached() {
        let (inner, cached) = repository(vec![token("t1", "u1")]);
        assert!(cached.find_by_id_and_user_id("t1", "u1").await.unwrap().is_some());
        inner.delete("t1").await.unwrap();
        assert!(cached.find_by_id_and_user_id("t1", "u1").await.unwrap().is_none());
    }
}
