use std::sync::{Arc, Mutex};
use std::time::Duration;

use async_trait::async_trait;

use super::FakeLLMProvider;
use crate::domain::llm_api_key::LlmApiKey;
use crate::domain::user::User;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::llm_provider_factory::{
    LLMProviderCredentials, LLMProviderFactory, LLMProviderResolution, LLMProviderResolveHints,
};
use crate::use_cases::ports::rate_limiter::RateLimiter;
use crate::use_cases::ports::remote_file_fetcher::{RemoteFile, RemoteFileFetcher};
use crate::use_cases::ports::LLMProvider;

/// The provider id a [`FakeLLMProviderFactory`] reports when the caller
/// named none: what the user's default would have been.
pub const FAKE_DEFAULT_PROVIDER: &str = "openai";

/// One `resolve_for_user` call a [`FakeLLMProviderFactory`] received.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolveCall {
    pub user_id: String,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub track_usage: bool,
    pub hinted_user: Option<Option<User>>,
    pub hinted_key: Option<Option<LlmApiKey>>,
}

/// A factory that hands out one scripted provider, or none.
///
/// `default()` is a user with nothing configured: every resolution and
/// `from_credentials` answer `None`. [`FakeLLMProviderFactory::with_provider`]
/// answers every call with the given provider, under the id that was asked
/// for. Every call is recorded.
#[derive(Default)]
pub struct FakeLLMProviderFactory {
    provider: Option<Arc<dyn LLMProvider>>,
    failures: Mutex<Vec<DomainError>>,
    resolve_calls: Mutex<Vec<ResolveCall>>,
    credentials_calls: Mutex<Vec<LLMProviderCredentials>>,
}

impl FakeLLMProviderFactory {
    pub fn with_provider(provider: Arc<dyn LLMProvider>) -> Self {
        Self { provider: Some(provider), ..Self::default() }
    }

    /// Resolves every call to a provider nobody scripted: for tests about
    /// which key was chosen, not what the model said.
    pub fn resolving_any() -> Self {
        Self::with_provider(Arc::new(FakeLLMProvider::new()))
    }

    /// Makes the next `resolve_for_user` fail with this error, as the
    /// limit-enforcing factory does for a key past its monthly limit.
    pub fn failing_once(self, error: DomainError) -> Self {
        self.failures.lock().unwrap().push(error);
        self
    }

    pub fn resolve_calls(&self) -> Vec<ResolveCall> {
        self.resolve_calls.lock().unwrap().clone()
    }

    pub fn credentials_calls(&self) -> Vec<LLMProviderCredentials> {
        self.credentials_calls.lock().unwrap().clone()
    }
}

#[async_trait]
impl LLMProviderFactory for FakeLLMProviderFactory {
    async fn resolve_for_user(
        &self,
        user_id: &str,
        provider: Option<&str>,
        model: Option<&str>,
        track_usage: bool,
        hints: LLMProviderResolveHints,
    ) -> DomainResult<Option<LLMProviderResolution>> {
        self.resolve_calls.lock().unwrap().push(ResolveCall {
            user_id: user_id.to_string(),
            provider: provider.map(str::to_string),
            model: model.map(str::to_string),
            track_usage,
            hinted_user: hints.user,
            hinted_key: hints.key,
        });
        if let Some(error) = self.failures.lock().unwrap().pop() {
            return Err(error);
        }
        Ok(self.provider.clone().map(|resolved| LLMProviderResolution {
            provider: resolved,
            provider_id: provider.unwrap_or(FAKE_DEFAULT_PROVIDER).to_string(),
            fell_back_from: None,
        }))
    }

    fn from_credentials(
        &self,
        credentials: LLMProviderCredentials,
    ) -> DomainResult<Option<Arc<dyn LLMProvider>>> {
        self.credentials_calls.lock().unwrap().push(credentials);
        Ok(self.provider.clone())
    }
}

/// A limiter that always gives the same answer and records the keys it was
/// asked about.
pub struct FixedRateLimiter {
    allowed: bool,
    keys: Mutex<Vec<String>>,
}

impl FixedRateLimiter {
    pub fn allowing() -> Self {
        Self { allowed: true, keys: Mutex::new(Vec::new()) }
    }

    pub fn rejecting() -> Self {
        Self { allowed: false, keys: Mutex::new(Vec::new()) }
    }

    pub fn keys(&self) -> Vec<String> {
        self.keys.lock().unwrap().clone()
    }
}

#[async_trait]
impl RateLimiter for FixedRateLimiter {
    async fn consume(&self, key: &str) -> bool {
        self.keys.lock().unwrap().push(key.to_string());
        self.allowed
    }
}

/// One fetch a [`FakeRemoteFileFetcher`] received.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FetchCall {
    pub url: String,
    pub timeout: Duration,
    pub max_bytes: usize,
}

/// Answers every fetch with the same outcome, applying the size cap to a
/// body the way a real fetcher must.
pub struct FakeRemoteFileFetcher {
    outcome: RemoteFile,
    calls: Mutex<Vec<FetchCall>>,
}

impl FakeRemoteFileFetcher {
    pub fn returning(outcome: RemoteFile) -> Self {
        Self { outcome, calls: Mutex::new(Vec::new()) }
    }

    pub fn calls(&self) -> Vec<FetchCall> {
        self.calls.lock().unwrap().clone()
    }
}

impl Default for FakeRemoteFileFetcher {
    fn default() -> Self {
        Self::returning(RemoteFile::Body(b"stored file".to_vec()))
    }
}

#[async_trait]
impl RemoteFileFetcher for FakeRemoteFileFetcher {
    async fn fetch(
        &self,
        url: &str,
        timeout: Duration,
        max_bytes: usize,
    ) -> DomainResult<RemoteFile> {
        self.calls.lock().unwrap().push(FetchCall { url: url.to_string(), timeout, max_bytes });
        Ok(match &self.outcome {
            RemoteFile::Body(body) if body.len() > max_bytes => RemoteFile::TooLarge,
            outcome => outcome.clone(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::use_cases::errors::ErrorCode;

    #[tokio::test]
    async fn an_unconfigured_factory_resolves_nothing_and_records_the_call() {
        let factory = FakeLLMProviderFactory::default();

        let provider = factory.for_user("user-1", None, Some("m"), true).await.unwrap();

        assert!(provider.is_none());
        assert_eq!(factory.resolve_calls()[0].model.as_deref(), Some("m"));
        assert!(factory.resolve_calls()[0].track_usage);
    }

    #[tokio::test]
    async fn a_configured_factory_answers_under_the_requested_id_and_fails_once_when_told_to() {
        let factory = FakeLLMProviderFactory::resolving_any()
            .failing_once(DomainError::ai_limit_reached("paused"));
        let hints = LLMProviderResolveHints::default;

        let first = factory.resolve_for_user("u", Some("groq"), None, true, hints()).await;
        let second = factory.resolve_for_user("u", Some("groq"), None, true, hints()).await;
        let third = factory.resolve_for_user("u", None, None, true, hints()).await;

        assert_eq!(first.err().map(|err| err.code()), Some(ErrorCode::AiLimitReached));
        assert_eq!(second.unwrap().unwrap().provider_id, "groq");
        assert_eq!(third.unwrap().unwrap().provider_id, FAKE_DEFAULT_PROVIDER);
    }

    #[tokio::test]
    async fn the_fixed_limiter_records_its_keys() {
        let limiter = FixedRateLimiter::rejecting();

        assert!(!limiter.consume("a:1").await);
        assert!(FixedRateLimiter::allowing().consume("a:1").await);
        assert_eq!(limiter.keys(), vec!["a:1"]);
    }

    #[tokio::test]
    async fn the_fake_fetcher_caps_a_body_and_records_the_call() {
        let fetcher = FakeRemoteFileFetcher::returning(RemoteFile::Body(vec![0; 10]));

        let small = fetcher.fetch("u", Duration::from_secs(1), 10).await.unwrap();
        let large = fetcher.fetch("u", Duration::from_secs(1), 9).await.unwrap();

        assert_eq!(small, RemoteFile::Body(vec![0; 10]));
        assert_eq!(large, RemoteFile::TooLarge);
        assert_eq!(fetcher.calls().len(), 2);
    }
}
