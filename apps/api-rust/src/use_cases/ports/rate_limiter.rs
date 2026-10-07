use std::time::Duration;

use async_trait::async_trait;

/// What a fixed-window limiter needs to know: how many attempts one key gets,
/// and how long before its count starts again.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RateLimit {
    pub max_attempts: u32,
    pub window: Duration,
}

impl RateLimit {
    pub const fn new(max_attempts: u32, window_ms: u64) -> Self {
        Self { max_attempts, window: Duration::from_millis(window_ms) }
    }
}

#[async_trait]
pub trait RateLimiter: Send + Sync {
    /// True if the request identified by `key` is allowed, false if it should
    /// be rejected.
    async fn consume(&self, key: &str) -> bool;
}
