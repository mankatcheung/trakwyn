use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use async_trait::async_trait;

use crate::use_cases::ports::RateLimiter;

/// Remembers every key it was asked about, in order, and refuses on demand.
///
/// Unlimited by default. A key can be refused outright
/// ([`FakeRateLimiter::rejecting_key`]), every key can be
/// ([`FakeRateLimiter::rejecting`]), or each key can be given an allowance
/// ([`FakeRateLimiter::allowing`]) after which it is refused; the window
/// never resets.
#[derive(Default)]
pub struct FakeRateLimiter {
    max_attempts: Option<u32>,
    reject_all: AtomicBool,
    rejected_keys: Mutex<HashSet<String>>,
    counts: Mutex<HashMap<String, u32>>,
    consumed: Mutex<Vec<String>>,
}

impl FakeRateLimiter {
    /// A limiter that lets each key through `max_attempts` times.
    pub fn allowing(max_attempts: u32) -> Self {
        Self { max_attempts: Some(max_attempts), ..Self::default() }
    }

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

    /// Every key consumed so far, in order, refused attempts included.
    pub fn consumed(&self) -> Vec<String> {
        self.consumed.lock().unwrap().clone()
    }

    /// The same as [`FakeRateLimiter::consumed`].
    pub fn keys(&self) -> Vec<String> {
        self.consumed()
    }
}

#[async_trait]
impl RateLimiter for FakeRateLimiter {
    async fn consume(&self, key: &str) -> bool {
        self.consumed.lock().unwrap().push(key.to_string());
        if self.reject_all.load(Ordering::SeqCst)
            || self.rejected_keys.lock().unwrap().contains(key)
        {
            return false;
        }
        let mut counts = self.counts.lock().unwrap();
        let count = counts.entry(key.to_string()).or_insert(0);
        if self.max_attempts.is_some_and(|max| *count >= max) {
            return false;
        }
        *count += 1;
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn is_unlimited_by_default_and_records_every_key() {
        let limiter = FakeRateLimiter::default();

        assert!(limiter.consume("a").await);
        assert!(limiter.consume("a").await);
        assert_eq!(limiter.consumed(), vec!["a", "a"]);
        assert_eq!(limiter.keys(), vec!["a", "a"]);
    }

    #[tokio::test]
    async fn refuses_a_key_past_its_allowance_without_affecting_others() {
        let limiter = FakeRateLimiter::allowing(1);

        assert!(limiter.consume("a").await);
        assert!(!limiter.consume("a").await);
        assert!(limiter.consume("b").await);
    }

    #[tokio::test]
    async fn rejects_everything_or_one_key() {
        assert!(!FakeRateLimiter::rejecting().consume("a").await);

        let limiter = FakeRateLimiter::default().rejecting_key("a");
        assert!(!limiter.consume("a").await);
        assert!(limiter.consume("b").await);
    }
}
