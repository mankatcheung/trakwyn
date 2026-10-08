use std::collections::HashMap;
use std::sync::Mutex;

use async_trait::async_trait;

use crate::use_cases::ports::RateLimiter;

/// Counts attempts per key and refuses a key once it has used its allowance.
/// Unlimited by default; the window never resets.
#[derive(Default)]
pub struct FakeRateLimiter {
    max_attempts: Option<u32>,
    counts: Mutex<HashMap<String, u32>>,
    consumed: Mutex<Vec<String>>,
}

impl FakeRateLimiter {
    /// A limiter that lets each key through `max_attempts` times.
    pub fn allowing(max_attempts: u32) -> Self {
        Self { max_attempts: Some(max_attempts), ..Self::default() }
    }

    /// Every key consumed so far, in order, refused attempts included.
    pub fn consumed(&self) -> Vec<String> {
        self.consumed.lock().unwrap().clone()
    }
}

#[async_trait]
impl RateLimiter for FakeRateLimiter {
    async fn consume(&self, key: &str) -> bool {
        self.consumed.lock().unwrap().push(key.to_string());
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
    }

    #[tokio::test]
    async fn refuses_a_key_past_its_allowance_without_affecting_others() {
        let limiter = FakeRateLimiter::allowing(1);

        assert!(limiter.consume("a").await);
        assert!(!limiter.consume("a").await);
        assert!(limiter.consume("b").await);
    }
}
