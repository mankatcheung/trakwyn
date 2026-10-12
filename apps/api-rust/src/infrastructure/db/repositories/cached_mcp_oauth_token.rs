//! Caches the token lookup every MCP request performs.
//!
//! Uncached, `POST /mcp` costs two database round trips (a read to identify
//! the caller and a write to stamp `lastUsedAt`) before any tool runs.
//!
//! Caching a bearer credential is only safe because the cached row carries its
//! own `revokedAt` and `expiresAt`, and `ValidateMcpOAuthAccessTokenUseCase`
//! checks both. Revocation is the case that needs handling: a row cached while
//! live says `revokedAt: null` and would go on saying so. That is what
//! `revoke_family` is for, with `TOKEN_TTL` as the ceiling if it is ever missed
//! rather than as the thing keeping it correct.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::domain::mcp_oauth::{McpOAuthAccessToken, McpOAuthScope};
use crate::infrastructure::cache::cache_keys::{
    mcp_oauth_token_by_hash, mcp_oauth_token_last_used,
};
use crate::infrastructure::cache::constants::{TOKEN_LAST_USED_TTL, TOKEN_TTL};
use crate::infrastructure::cache::{Cache, CacheExt};
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{CreateMcpOAuthAccessTokenData, McpOAuthTokenRepository};

/// The row as `apps/api` caches it: camelCase fields, ISO-8601 timestamps.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CachedToken {
    id: String,
    user_id: String,
    client_id: String,
    family_id: String,
    token_hash: String,
    scope: String,
    audience: String,
    expires_at: DateTime<Utc>,
    revoked_at: Option<DateTime<Utc>>,
    last_used_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
}

impl From<McpOAuthAccessToken> for CachedToken {
    fn from(token: McpOAuthAccessToken) -> Self {
        Self {
            id: token.id,
            user_id: token.user_id,
            client_id: token.client_id,
            family_id: token.family_id,
            token_hash: token.token_hash,
            scope: token.scope.as_str().to_string(),
            audience: token.audience,
            expires_at: token.expires_at,
            revoked_at: token.revoked_at,
            last_used_at: token.last_used_at,
            created_at: token.created_at,
        }
    }
}

impl CachedToken {
    fn into_entity(self) -> DomainResult<McpOAuthAccessToken> {
        let scope = McpOAuthScope::parse(&self.scope).ok_or_else(|| {
            DomainError::internal("cached McpOAuthAccessToken has an unknown scope")
        })?;
        Ok(McpOAuthAccessToken {
            id: self.id,
            user_id: self.user_id,
            client_id: self.client_id,
            family_id: self.family_id,
            token_hash: self.token_hash,
            scope,
            audience: self.audience,
            expires_at: self.expires_at,
            revoked_at: self.revoked_at,
            last_used_at: self.last_used_at,
            created_at: self.created_at,
        })
    }
}

pub struct CachedMcpOAuthTokenRepository {
    inner: Arc<dyn McpOAuthTokenRepository>,
    cache: Arc<dyn Cache>,
}

impl CachedMcpOAuthTokenRepository {
    pub fn new(inner: Arc<dyn McpOAuthTokenRepository>, cache: Arc<dyn Cache>) -> Self {
        Self { inner, cache }
    }
}

#[async_trait]
impl McpOAuthTokenRepository for CachedMcpOAuthTokenRepository {
    async fn create(
        &self,
        data: CreateMcpOAuthAccessTokenData,
    ) -> DomainResult<McpOAuthAccessToken> {
        self.inner.create(data).await
    }

    async fn find_by_token_hash(
        &self,
        token_hash: &str,
    ) -> DomainResult<Option<McpOAuthAccessToken>> {
        let cached: Option<CachedToken> = self
            .cache
            .get_or_set(
                &mcp_oauth_token_by_hash(token_hash),
                || async {
                    let token = self.inner.find_by_token_hash(token_hash).await?;
                    Ok(token.map(CachedToken::from))
                },
                Some(TOKEN_TTL),
            )
            .await?;
        cached.map(CachedToken::into_entity).transpose()
    }

    /// Throttled to one write per token per window. The first caller in a
    /// window populates the marker key and writes; everyone after it finds the
    /// key and skips the database entirely. The cached row keeps its old
    /// `lastUsedAt`, which does not matter: nothing reads it from here (the
    /// settings list reads it through the uncached grant repository).
    async fn update_last_used(&self, id: &str) -> DomainResult<()> {
        let first_in_window = AtomicBool::new(false);
        self.cache
            .get_or_set::<i64, _, _>(
                &mcp_oauth_token_last_used(id),
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

    async fn revoke(&self, id: &str) -> DomainResult<()> {
        self.inner.revoke(id).await
    }

    /// Revocation has to reach the cache or it does not reach anything. The
    /// inner call reports which hashes it revoked, so exactly those keys are
    /// dropped: no second query to discover them, and no chance of the two
    /// disagreeing.
    async fn revoke_family(
        &self,
        family_id: &str,
        revoked_at: DateTime<Utc>,
    ) -> DomainResult<Vec<String>> {
        let revoked_hashes = self.inner.revoke_family(family_id, revoked_at).await?;
        for hash in &revoked_hashes {
            self.cache.delete(&mcp_oauth_token_by_hash(hash)).await;
        }
        Ok(revoked_hashes)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::AtomicUsize;

    use chrono::TimeDelta;

    use super::*;
    use crate::infrastructure::cache::MemoryCache;
    use crate::use_cases::clock::now;
    use crate::use_cases::test_support::FakeMcpOAuthTokenRepository;

    const HASH: &str = "hash-1";

    /// The fake, with the calls that reach it counted.
    struct Counting {
        inner: FakeMcpOAuthTokenRepository,
        finds: AtomicUsize,
        last_used_writes: AtomicUsize,
    }

    #[async_trait]
    impl McpOAuthTokenRepository for Counting {
        async fn create(
            &self,
            data: CreateMcpOAuthAccessTokenData,
        ) -> DomainResult<McpOAuthAccessToken> {
            self.inner.create(data).await
        }

        async fn find_by_token_hash(
            &self,
            token_hash: &str,
        ) -> DomainResult<Option<McpOAuthAccessToken>> {
            self.finds.fetch_add(1, Ordering::SeqCst);
            self.inner.find_by_token_hash(token_hash).await
        }

        async fn update_last_used(&self, id: &str) -> DomainResult<()> {
            self.last_used_writes.fetch_add(1, Ordering::SeqCst);
            self.inner.update_last_used(id).await
        }

        async fn revoke(&self, id: &str) -> DomainResult<()> {
            self.inner.revoke(id).await
        }

        async fn revoke_family(
            &self,
            family_id: &str,
            revoked_at: DateTime<Utc>,
        ) -> DomainResult<Vec<String>> {
            self.inner.revoke_family(family_id, revoked_at).await
        }
    }

    fn token(id: &str, hash: &str, family: &str) -> McpOAuthAccessToken {
        McpOAuthAccessToken {
            id: id.to_string(),
            user_id: "user-1".to_string(),
            client_id: "client-1".to_string(),
            family_id: family.to_string(),
            token_hash: hash.to_string(),
            scope: McpOAuthScope::Read,
            audience: "/mcp".to_string(),
            expires_at: now() + TimeDelta::days(1),
            revoked_at: None,
            last_used_at: None,
            created_at: now(),
        }
    }

    fn repository(
        tokens: Vec<McpOAuthAccessToken>,
    ) -> (Arc<Counting>, CachedMcpOAuthTokenRepository) {
        let inner = Arc::new(Counting {
            inner: FakeMcpOAuthTokenRepository::with(tokens),
            finds: AtomicUsize::new(0),
            last_used_writes: AtomicUsize::new(0),
        });
        let cached =
            CachedMcpOAuthTokenRepository::new(inner.clone(), Arc::new(MemoryCache::default()));
        (inner, cached)
    }

    #[tokio::test]
    async fn hits_the_database_once_for_repeated_lookups_of_the_same_token() {
        let stored = token("t1", HASH, "g1");
        let (inner, cached) = repository(vec![stored.clone()]);

        for _ in 0..3 {
            assert_eq!(cached.find_by_token_hash(HASH).await.unwrap(), Some(stored.clone()));
        }

        assert_eq!(inner.finds.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn an_unknown_token_is_cached_as_unknown() {
        let (inner, cached) = repository(vec![]);
        assert_eq!(cached.find_by_token_hash("nope").await.unwrap(), None);
        assert_eq!(cached.find_by_token_hash("nope").await.unwrap(), None);
        assert_eq!(inner.finds.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn drops_every_cached_row_in_a_revoked_family_and_only_those() {
        let (inner, cached) = repository(vec![
            token("t1", "h1", "g1"),
            token("t2", "h2", "g1"),
            token("t3", "h3", "g2"),
        ]);
        for hash in ["h1", "h2", "h3"] {
            cached.find_by_token_hash(hash).await.unwrap();
        }

        let revoked = cached.revoke_family("g1", now()).await.unwrap();
        assert_eq!(revoked.len(), 2);

        // The revoked rows are re-read and now say so; the other is still cached.
        assert!(cached.find_by_token_hash("h1").await.unwrap().unwrap().revoked_at.is_some());
        assert!(cached.find_by_token_hash("h2").await.unwrap().unwrap().revoked_at.is_some());
        assert!(cached.find_by_token_hash("h3").await.unwrap().unwrap().revoked_at.is_none());
        assert_eq!(inner.finds.load(Ordering::SeqCst), 5);
    }

    #[tokio::test]
    async fn writes_last_used_once_per_window_per_token() {
        let (inner, cached) = repository(vec![token("t1", "h1", "g1"), token("t2", "h2", "g1")]);

        for _ in 0..5 {
            cached.update_last_used("t1").await.unwrap();
        }
        assert_eq!(inner.last_used_writes.load(Ordering::SeqCst), 1);

        cached.update_last_used("t2").await.unwrap();
        assert_eq!(inner.last_used_writes.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn still_serves_an_expired_row_for_the_use_case_to_refuse() {
        let mut expired = token("t1", HASH, "g1");
        expired.expires_at = now() - TimeDelta::seconds(5);
        let (_, cached) = repository(vec![expired.clone()]);

        cached.find_by_token_hash(HASH).await.unwrap();
        assert_eq!(cached.find_by_token_hash(HASH).await.unwrap(), Some(expired));
    }
}
