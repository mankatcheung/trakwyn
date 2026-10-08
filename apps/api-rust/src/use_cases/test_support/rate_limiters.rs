use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use async_trait::async_trait;

use crate::use_cases::ports::RateLimiter;

/// Allows everything unless told otherwise, and remembers every key it was
/// asked about, in order.
#[derive(Default)]
pub struct FakeRateLimiter {
    reject_all: AtomicBool,
    rejected_keys: Mutex<HashSet<String>>,
    consumed: Mutex<Vec<String>>,
}

impl FakeRateLimiter {
    /// A limiter whose every key is already over its limit.
    pub fn rejecting() -> Self {
        let limiter = Self::default();
        limiter.reject_all.store(true, Ordering::SeqCst);
        limiter
    }

    /// Puts one key over its limit.
    pub fn rejecting_key(self, key: &str) -> Self {
        self.rejected_keys.lock().unwrap().insert(key.to_string());
        self
    }

    /// Every key consumed so far, oldest first.
    pub fn keys(&self) -> Vec<String> {
        self.consumed.lock().unwrap().clone()
    }
}

#[async_trait]
impl RateLimiter for FakeRateLimiter {
    async fn consume(&self, key: &str) -> bool {
        self.consumed.lock().unwrap().push(key.to_string());
        !self.reject_all.load(Ordering::SeqCst) && !self.rejected_keys.lock().unwrap().contains(key)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn allows_by_default_and_records_the_keys() {
        let limiter = FakeRateLimiter::default();
        assert!(limiter.consume("a").await);
        assert!(limiter.consume("b").await);
        assert_eq!(limiter.keys(), vec!["a", "b"]);
    }

    #[tokio::test]
    async fn rejects_everything_or_one_key() {
        assert!(!FakeRateLimiter::rejecting().consume("a").await);

        let limiter = FakeRateLimiter::default().rejecting_key("a");
        assert!(!limiter.consume("a").await);
        assert!(limiter.consume("b").await);
    }
}
