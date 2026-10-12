use std::collections::HashSet;
use std::sync::Mutex;

use async_trait::async_trait;

use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::outbound_url_policy::{OutboundUrlPolicy, OutboundUrlPurpose};

/// Allows every URL except the ones it was told to refuse, and remembers
/// each check it was asked to make.
#[derive(Default)]
pub struct FakeOutboundUrlPolicy {
    refused: HashSet<String>,
    refuse_all: bool,
    checks: Mutex<Vec<(String, OutboundUrlPurpose)>>,
}

impl FakeOutboundUrlPolicy {
    pub fn allow_all() -> Self {
        Self::default()
    }

    /// Refuses exactly these URLs.
    pub fn refusing(urls: &[&str]) -> Self {
        Self { refused: urls.iter().map(|url| url.to_string()).collect(), ..Self::default() }
    }

    pub fn refuse_all() -> Self {
        Self { refuse_all: true, ..Self::default() }
    }

    /// Every URL checked so far with its purpose, in order.
    pub fn checks(&self) -> Vec<(String, OutboundUrlPurpose)> {
        self.checks.lock().unwrap().clone()
    }
}

#[async_trait]
impl OutboundUrlPolicy for FakeOutboundUrlPolicy {
    async fn assert_allowed(&self, url: &str, purpose: OutboundUrlPurpose) -> DomainResult<()> {
        self.checks.lock().unwrap().push((url.to_string(), purpose));
        if self.refuse_all || self.refused.contains(url) {
            return Err(DomainError::validation("URL host is not allowed"));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::use_cases::errors::ErrorCode;

    #[tokio::test]
    async fn allows_everything_by_default_and_records_each_check() {
        let policy = FakeOutboundUrlPolicy::allow_all();

        policy.assert_allowed("http://localhost/", OutboundUrlPurpose::LlmProvider).await.unwrap();
        policy
            .assert_allowed("https://jobs.example/1", OutboundUrlPurpose::JobPosting)
            .await
            .unwrap();

        assert_eq!(
            policy.checks(),
            vec![
                ("http://localhost/".to_string(), OutboundUrlPurpose::LlmProvider),
                ("https://jobs.example/1".to_string(), OutboundUrlPurpose::JobPosting),
            ]
        );
    }

    #[tokio::test]
    async fn refuses_the_listed_urls_with_a_validation_error() {
        let policy = FakeOutboundUrlPolicy::refusing(&["http://169.254.169.254/"]);

        let err = policy
            .assert_allowed("http://169.254.169.254/", OutboundUrlPurpose::JobPosting)
            .await
            .unwrap_err();

        assert_eq!(err.code(), ErrorCode::Validation);
        assert_eq!(err.to_string(), "URL host is not allowed");
        policy
            .assert_allowed("https://example.com/", OutboundUrlPurpose::JobPosting)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn can_refuse_everything() {
        let policy = FakeOutboundUrlPolicy::refuse_all();

        assert!(policy
            .assert_allowed("https://example.com/", OutboundUrlPurpose::LlmProvider)
            .await
            .is_err());
    }
}
