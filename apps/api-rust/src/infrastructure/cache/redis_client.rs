use std::time::Duration;

use async_trait::async_trait;
use serde_json::Value;

/// Why a Redis call failed.
///
/// The text never includes the command that was sent: a key can hold an
/// email address and a value a whole cached row, and these errors are logged.
#[derive(Debug, thiserror::Error)]
pub enum RedisError {
    /// The request never got an answer.
    #[error("Redis request failed: {0}")]
    Transport(#[source] Box<dyn std::error::Error + Send + Sync>),
    /// Redis answered with an error.
    #[error("Redis answered {status}: {message}")]
    Command { status: u16, message: String },
    /// The answer was not in the shape the REST API documents.
    #[error("Redis response was not understood: {0}")]
    Protocol(String),
}

/// `SET` modifiers.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct SetOptions {
    /// Only set the key if it does not exist yet (`NX`).
    pub nx: bool,
    /// Expire the key after this long (`PX`, in milliseconds).
    pub px: Option<Duration>,
}

impl SetOptions {
    pub const fn px(ttl: Duration) -> Self {
        Self { nx: false, px: Some(ttl) }
    }

    pub const fn nx_px(ttl: Duration) -> Self {
        Self { nx: true, px: Some(ttl) }
    }
}

/// The subset of Redis the cache, the rate limiter and the session blocklist
/// use. Kept narrow and separate from `Cache` so tests can inject an
/// in-memory fake instead of reaching real Upstash infrastructure.
///
/// Values are JSON, encoded the way `@upstash/redis` encodes them, so this
/// implementation and `apps/api` can read each other's entries.
#[async_trait]
pub trait RedisClient: Send + Sync {
    /// `None` when the key is absent, and also when the stored value is JSON
    /// `null`: Redis's reply cannot tell them apart.
    async fn get(&self, key: &str) -> Result<Option<Value>, RedisError>;

    /// False when `nx` was asked for and the key already existed.
    async fn set(&self, key: &str, value: &Value, options: SetOptions) -> Result<bool, RedisError>;

    /// How many of the keys existed.
    async fn del(&self, keys: &[String]) -> Result<u64, RedisError>;

    /// The value after incrementing.
    async fn incr(&self, key: &str) -> Result<i64, RedisError>;

    /// One page of a keyspace walk: the cursor to continue from (`"0"` once
    /// the walk is complete) and the keys found.
    async fn scan(
        &self,
        cursor: &str,
        pattern: Option<&str>,
        count: Option<u32>,
    ) -> Result<(String, Vec<String>), RedisError>;
}
