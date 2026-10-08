use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;

use crate::domain::llm_api_key::LlmApiKey;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::llm_api_key_repository::LlmApiKeyRepository;
use crate::use_cases::ports::llm_provider::LLMProvider;
use crate::use_cases::ports::llm_provider_factory::{
    LLMProviderCredentials, LLMProviderFactory, LLMProviderResolution, LLMProviderResolveHints,
};
use crate::use_cases::ports::llm_usage_event_repository::LlmUsageEventRepository;
use crate::use_cases::ports::user_repository::UserRepository;
use crate::use_cases::shared::token_limit::{is_limit_reached, start_of_utc_month, Now};

const LIMIT_REACHED_MESSAGE: &str = "This API key has reached its monthly token limit";

/// The key this request would have used has spent its monthly token limit.
///
/// `apps/api`'s error also carries the provider and when the allowance
/// refills (`shared::token_limit::start_of_next_utc_month`); nothing there
/// reads either field, so the code and message are the whole of what a
/// client sees.
fn limit_reached() -> DomainError {
    DomainError::ai_limit_reached(LIMIT_REACHED_MESSAGE)
}

/// Refuses a key that has spent its monthly token limit and, when the user
/// has opted in, stands another of their keys in for it (JEF-258).
///
/// A decorator over `LLMProviderFactory` rather than a check inside each AI
/// use case: `resolve_for_user` is the one place every real AI feature
/// resolves a provider through, so every call site is covered by
/// construction and no future one has to remember.
///
/// **`track_usage: false` is not enforced.** That flag marks a call whose
/// tokens are deliberately not counted: today only the "test a saved key"
/// path. A call that does not count toward the limit must not be refused by
/// it, and blocking it would take away the one button that diagnoses the key
/// that is paused. It still spends a few tokens of the user's money
/// (`llm::TEST_API_KEY_MAX_TOKENS`), which is the deliberate trade.
///
/// `from_credentials` is untouched for the same reason and one more: it is
/// for a key that has not been saved yet, so there is no limit to read.
///
/// The month's usage comes from the primary database, so there is no
/// fail-open decision to make here: if that read fails the request was going
/// to fail anyway. This deliberately does not fail open the way the Redis
/// paths do: a spending limit that stops applying under load is not a limit.
pub struct LimitEnforcingLLMProviderFactory {
    pub user_llm_provider_factory: Arc<dyn LLMProviderFactory>,
    pub user_repository: Arc<dyn UserRepository>,
    pub llm_api_key_repository: Arc<dyn LlmApiKeyRepository>,
    pub llm_usage_event_repository: Arc<dyn LlmUsageEventRepository>,
    pub now: Now,
}

impl LimitEnforcingLLMProviderFactory {
    async fn used_tokens_by_provider(&self, user_id: &str) -> DomainResult<HashMap<String, i64>> {
        let summaries = self
            .llm_usage_event_repository
            .summarize_by_user_id(user_id, start_of_utc_month((self.now)()))
            .await?;
        Ok(summaries
            .into_iter()
            .map(|summary| (summary.provider, summary.prompt_tokens + summary.completion_tokens))
            .collect())
    }
}

fn is_paused(key: &LlmApiKey, used_by_provider: &HashMap<String, i64>) -> bool {
    is_limit_reached(
        used_by_provider.get(&key.provider).copied().unwrap_or(0),
        key.monthly_token_limit,
    )
}

#[async_trait]
impl LLMProviderFactory for LimitEnforcingLLMProviderFactory {
    async fn resolve_for_user(
        &self,
        user_id: &str,
        provider: Option<&str>,
        model: Option<&str>,
        track_usage: bool,
        _hints: LLMProviderResolveHints,
    ) -> DomainResult<Option<LLMProviderResolution>> {
        let inner = &self.user_llm_provider_factory;
        if !track_usage {
            return inner
                .resolve_for_user(
                    user_id,
                    provider,
                    model,
                    track_usage,
                    LLMProviderResolveHints::default(),
                )
                .await;
        }

        // Loaded once here and handed down as hints (F9): the inner factory
        // would otherwise fetch the same user and key again on every call.
        let named = provider.filter(|provider| !provider.is_empty());
        let user = match named {
            Some(_) => None,
            None => Some(self.user_repository.find_by_id(user_id).await?),
        };
        let requested = named.map(str::to_string).or_else(|| {
            user.as_ref()
                .and_then(Option::as_ref)
                .and_then(|user| user.default_llm_provider.clone())
                .filter(|provider| !provider.is_empty())
        });
        // No provider and no key are the inner factory's cases to report: it
        // returns `None` and the caller raises AI_NOT_CONFIGURED.
        let Some(requested) = requested else {
            let hints = LLMProviderResolveHints { user, key: None };
            return inner.resolve_for_user(user_id, provider, model, track_usage, hints).await;
        };

        let used_by_provider = self.used_tokens_by_provider(user_id).await?;
        let keys = self.llm_api_key_repository.find_all_by_user_id(user_id).await?;
        let requested_key = keys.iter().find(|key| key.provider == requested).cloned();

        let paused = requested_key.as_ref().is_some_and(|key| is_paused(key, &used_by_provider));
        if !paused {
            let hints = LLMProviderResolveHints { user, key: Some(requested_key) };
            return inner.resolve_for_user(user_id, provider, model, track_usage, hints).await;
        }

        let fallback_user = match user {
            Some(Some(user)) => Some(user),
            _ => self.user_repository.find_by_id(user_id).await?,
        };
        let Some(fallback_user) = fallback_user.filter(|user| user.llm_fallback_when_limited)
        else {
            return Err(limit_reached());
        };

        // Oldest key first, so the substitute is stable from one call to the
        // next rather than reshuffling as usage moves around.
        let mut candidates: Vec<&LlmApiKey> =
            keys.iter().filter(|key| key.provider != requested).collect();
        candidates.sort_by_key(|key| key.created_at);
        let Some(substitute) =
            candidates.into_iter().find(|key| !is_paused(key, &used_by_provider)).cloned()
        else {
            return Err(limit_reached());
        };

        // The substitute's own model, not the caller's: a model name is
        // provider-specific, and passing one across would ask the stand-in
        // for a model it does not have.
        let substitute_provider = substitute.provider.clone();
        let hints = LLMProviderResolveHints {
            user: Some(Some(fallback_user)),
            key: Some(Some(substitute)),
        };
        let resolution = inner
            .resolve_for_user(user_id, Some(&substitute_provider), None, track_usage, hints)
            .await?;
        // A key that cannot be built (an unknown provider id, say) is the
        // same as having no substitute at all.
        let Some(resolution) = resolution else { return Err(limit_reached()) };

        Ok(Some(LLMProviderResolution { fell_back_from: Some(requested), ..resolution }))
    }

    fn from_credentials(
        &self,
        credentials: LLMProviderCredentials,
    ) -> DomainResult<Option<Arc<dyn LLMProvider>>> {
        self.user_llm_provider_factory.from_credentials(credentials)
    }
}

#[cfg(test)]
mod tests {
    use chrono::{DateTime, TimeDelta, Utc};

    use super::*;
    use crate::domain::llm_usage_event::LlmUsageEvent;
    use crate::domain::user::User;
    use crate::use_cases::errors::ErrorCode;
    use crate::use_cases::test_support::{
        user_with_email, FakeLLMProviderFactory, FakeLlmApiKeyRepository,
        FakeLlmUsageEventRepository, FakeUserRepository, ResolveCall,
    };

    const USER: &str = "user-1";

    fn at(text: &str) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(text).unwrap().with_timezone(&Utc)
    }

    fn now() -> DateTime<Utc> {
        at("2026-07-17T12:00:00Z")
    }

    fn user(default_llm_provider: Option<&str>, fallback: bool) -> User {
        User {
            default_llm_provider: default_llm_provider.map(str::to_string),
            llm_fallback_when_limited: fallback,
            ..user_with_email(USER, "user@example.com")
        }
    }

    fn key(provider: &str, limit: Option<i64>, age_days: i64) -> LlmApiKey {
        let created_at = now() - TimeDelta::days(age_days);
        LlmApiKey {
            id: format!("key-{provider}"),
            user_id: USER.to_string(),
            provider: provider.to_string(),
            api_key: "ciphertext".to_string(),
            model: None,
            base_url: None,
            monthly_token_limit: limit,
            created_at,
            updated_at: created_at,
        }
    }

    fn usage(
        provider: &str,
        prompt: i32,
        completion: i32,
        created_at: DateTime<Utc>,
    ) -> LlmUsageEvent {
        LlmUsageEvent {
            id: format!("event-{provider}-{prompt}-{completion}-{}", created_at.timestamp()),
            user_id: USER.to_string(),
            provider: provider.to_string(),
            model: None,
            prompt_tokens: prompt,
            completion_tokens: completion,
            cache_read_tokens: None,
            cache_write_tokens: None,
            estimated: false,
            created_at,
        }
    }

    struct Fixture {
        inner: Arc<FakeLLMProviderFactory>,
        factory: LimitEnforcingLLMProviderFactory,
    }

    fn fixture(user: User, keys: Vec<LlmApiKey>, events: Vec<LlmUsageEvent>) -> Fixture {
        let inner = Arc::new(FakeLLMProviderFactory::resolving_any());
        let factory = LimitEnforcingLLMProviderFactory {
            user_llm_provider_factory: inner.clone(),
            user_repository: Arc::new(FakeUserRepository::with(vec![user])),
            llm_api_key_repository: Arc::new(FakeLlmApiKeyRepository::with(keys)),
            llm_usage_event_repository: Arc::new(FakeLlmUsageEventRepository::with(events)),
            now: Arc::new(now),
        };
        Fixture { inner, factory }
    }

    async fn resolve(
        fixture: &Fixture,
        provider: Option<&str>,
        model: Option<&str>,
        track_usage: bool,
    ) -> DomainResult<Option<LLMProviderResolution>> {
        fixture
            .factory
            .resolve_for_user(
                USER,
                provider,
                model,
                track_usage,
                LLMProviderResolveHints::default(),
            )
            .await
    }

    fn this_month() -> DateTime<Utc> {
        at("2026-07-03T00:00:00Z")
    }

    fn only_call(fixture: &Fixture) -> ResolveCall {
        let calls = fixture.inner.resolve_calls();
        assert_eq!(calls.len(), 1, "{calls:?}");
        calls[0].clone()
    }

    #[tokio::test]
    async fn passes_through_when_the_key_has_no_limit() {
        let fixture = fixture(
            user(None, false),
            vec![key("openai", None, 1)],
            vec![usage("openai", 5_000_000, 0, this_month())],
        );

        let resolution = resolve(&fixture, Some("openai"), None, true).await.unwrap().unwrap();

        assert_eq!(resolution.provider_id, "openai");
    }

    #[tokio::test]
    async fn passes_through_while_usage_is_below_the_limit() {
        let fixture = fixture(
            user(None, false),
            vec![key("openai", Some(1000), 1)],
            vec![usage("openai", 600, 399, this_month())],
        );

        assert!(resolve(&fixture, Some("openai"), None, true).await.unwrap().is_some());
    }

    #[tokio::test]
    async fn refuses_once_the_combined_tokens_meet_the_limit() {
        let fixture = fixture(
            user(None, false),
            vec![key("openai", Some(1000), 1)],
            vec![usage("openai", 600, 400, this_month())],
        );

        let err = resolve(&fixture, Some("openai"), None, true).await.err().unwrap();

        assert_eq!(err.code(), ErrorCode::AiLimitReached);
        assert_eq!(err.to_string(), "This API key has reached its monthly token limit");
        assert!(fixture.inner.resolve_calls().is_empty());
    }

    #[tokio::test]
    async fn last_months_usage_does_not_count() {
        let fixture = fixture(
            user(None, false),
            vec![key("openai", Some(1000), 60)],
            vec![
                usage("openai", 900_000, 0, at("2026-06-30T23:59:59Z")),
                usage("openai", 10, 0, at("2026-07-01T00:00:00Z")),
            ],
        );

        assert!(resolve(&fixture, Some("openai"), None, true).await.unwrap().is_some());
    }

    #[tokio::test]
    async fn resolves_the_default_provider_when_none_is_named() {
        let fixture = fixture(
            user(Some("anthropic"), false),
            vec![key("anthropic", Some(1000), 1)],
            vec![usage("anthropic", 1000, 0, this_month())],
        );

        let err = resolve(&fixture, None, None, true).await.err().unwrap();

        assert_eq!(err.code(), ErrorCode::AiLimitReached);
    }

    #[tokio::test]
    async fn defers_to_the_inner_factory_when_the_user_has_no_default_provider() {
        let fixture = fixture(user(None, false), vec![key("openai", Some(1), 1)], vec![]);

        resolve(&fixture, None, None, true).await.unwrap();

        let call = only_call(&fixture);
        assert_eq!(call.provider, None);
        assert_eq!(
            call.hinted_user.map(|user| user.map(|user| user.id)),
            Some(Some(USER.to_string()))
        );
        assert_eq!(call.hinted_key, None);
    }

    #[tokio::test]
    async fn ignores_another_providers_usage() {
        let fixture = fixture(
            user(None, false),
            vec![key("openai", Some(1000), 1), key("anthropic", None, 2)],
            vec![usage("anthropic", 9_000_000, 0, this_month())],
        );

        assert!(resolve(&fixture, Some("openai"), None, true).await.unwrap().is_some());
    }

    #[tokio::test]
    async fn does_not_enforce_a_limit_on_an_untracked_call() {
        let fixture = fixture(
            user(None, false),
            vec![key("openai", Some(1000), 1)],
            vec![usage("openai", 5000, 0, this_month())],
        );

        let resolution = resolve(&fixture, Some("openai"), None, false).await.unwrap();

        assert!(resolution.is_some());
        let call = only_call(&fixture);
        assert!(!call.track_usage);
        assert_eq!(call.hinted_user, None);
        assert_eq!(call.hinted_key, None);
    }

    #[tokio::test]
    async fn leaves_from_credentials_alone_there_is_no_saved_key_to_have_a_limit() {
        let fixture = fixture(
            user(None, false),
            vec![key("openai", Some(1), 1)],
            vec![usage("openai", 5000, 0, this_month())],
        );

        let provider = fixture
            .factory
            .from_credentials(LLMProviderCredentials {
                provider: "openai".to_string(),
                api_key: "sk-unsaved".to_string(),
                model: None,
                base_url: None,
            })
            .unwrap();

        assert!(provider.is_some());
        assert_eq!(fixture.inner.credentials_calls().len(), 1);
    }

    #[tokio::test]
    async fn refuses_rather_than_substituting_when_the_user_has_not_opted_in() {
        let fixture = fixture(
            user(None, false),
            vec![key("openai", Some(1000), 1), key("anthropic", None, 2)],
            vec![usage("openai", 1000, 0, this_month())],
        );

        let err = resolve(&fixture, Some("openai"), None, true).await.err().unwrap();

        assert_eq!(err.code(), ErrorCode::AiLimitReached);
    }

    #[tokio::test]
    async fn uses_another_key_with_headroom_when_the_user_has_opted_in() {
        let fixture = fixture(
            user(None, true),
            vec![key("openai", Some(1000), 1), key("anthropic", None, 2)],
            vec![usage("openai", 1000, 0, this_month())],
        );

        let resolution = resolve(&fixture, Some("openai"), None, true).await.unwrap().unwrap();

        assert_eq!(resolution.provider_id, "anthropic");
        assert_eq!(resolution.fell_back_from.as_deref(), Some("openai"));
    }

    #[tokio::test]
    async fn picks_the_oldest_key_with_headroom() {
        let fixture = fixture(
            user(None, true),
            vec![
                key("openai", Some(1000), 1),
                key("groq", None, 3),
                key("anthropic", None, 30),
                key("mistral", None, 10),
            ],
            vec![usage("openai", 1000, 0, this_month())],
        );

        let resolution = resolve(&fixture, Some("openai"), None, true).await.unwrap().unwrap();

        assert_eq!(resolution.provider_id, "anthropic");
    }

    #[tokio::test]
    async fn skips_a_substitute_that_is_itself_at_its_limit() {
        let fixture = fixture(
            user(None, true),
            vec![
                key("openai", Some(1000), 1),
                key("anthropic", Some(500), 30),
                key("mistral", Some(500), 10),
            ],
            vec![
                usage("openai", 1000, 0, this_month()),
                usage("anthropic", 250, 250, this_month()),
                usage("mistral", 499, 0, this_month()),
            ],
        );

        let resolution = resolve(&fixture, Some("openai"), None, true).await.unwrap().unwrap();

        assert_eq!(resolution.provider_id, "mistral");
    }

    #[tokio::test]
    async fn refuses_when_every_key_is_at_its_limit() {
        let fixture = fixture(
            user(None, true),
            vec![key("openai", Some(1000), 1), key("anthropic", Some(500), 30)],
            vec![usage("openai", 1000, 0, this_month()), usage("anthropic", 500, 0, this_month())],
        );

        let err = resolve(&fixture, Some("openai"), None, true).await.err().unwrap();

        assert_eq!(err.code(), ErrorCode::AiLimitReached);
    }

    #[tokio::test]
    async fn refuses_when_there_is_no_other_key_at_all() {
        let fixture = fixture(
            user(None, true),
            vec![key("openai", Some(1000), 1)],
            vec![usage("openai", 1000, 0, this_month())],
        );

        let err = resolve(&fixture, Some("openai"), None, true).await.err().unwrap();

        assert_eq!(err.code(), ErrorCode::AiLimitReached);
    }

    #[tokio::test]
    async fn refuses_when_the_substitute_cannot_be_built() {
        let mut fixture = fixture(
            user(None, true),
            vec![key("openai", Some(1000), 1), key("retired", None, 2)],
            vec![usage("openai", 1000, 0, this_month())],
        );
        let inner = Arc::new(FakeLLMProviderFactory::default());
        fixture.factory.user_llm_provider_factory = inner;

        let err = resolve(&fixture, Some("openai"), None, true).await.err().unwrap();

        assert_eq!(err.code(), ErrorCode::AiLimitReached);
    }

    #[tokio::test]
    async fn lets_the_substitute_use_its_own_model_not_the_paused_keys() {
        let fixture = fixture(
            user(None, true),
            vec![key("openai", Some(1000), 1), key("anthropic", None, 2)],
            vec![usage("openai", 1000, 0, this_month())],
        );

        resolve(&fixture, Some("openai"), Some("gpt-pinned"), true).await.unwrap();

        let call = only_call(&fixture);
        assert_eq!(call.provider.as_deref(), Some("anthropic"));
        assert_eq!(call.model, None);
    }

    #[tokio::test]
    async fn reports_no_fallback_on_the_ordinary_path() {
        let fixture = fixture(user(None, true), vec![key("openai", Some(1000), 1)], vec![]);

        let resolution = resolve(&fixture, Some("openai"), Some("gpt-pinned"), true).await.unwrap();

        assert_eq!(resolution.unwrap().fell_back_from, None);
        assert_eq!(only_call(&fixture).model.as_deref(), Some("gpt-pinned"));
    }

    #[tokio::test]
    async fn hands_the_key_it_already_loaded_to_the_inner_factory_so_it_is_not_fetched_twice() {
        let fixture = fixture(user(None, false), vec![key("openai", Some(1000), 1)], vec![]);

        resolve(&fixture, Some("openai"), None, true).await.unwrap();

        let call = only_call(&fixture);
        assert_eq!(
            call.hinted_key.map(|key| key.map(|key| key.provider)),
            Some(Some("openai".to_string()))
        );
        // An explicit provider never needs the user row.
        assert_eq!(call.hinted_user, None);
    }

    #[tokio::test]
    async fn a_named_provider_with_no_key_is_the_inner_factorys_case_to_report() {
        let fixture = fixture(user(None, false), vec![], vec![]);

        resolve(&fixture, Some("openai"), None, true).await.unwrap();

        assert_eq!(only_call(&fixture).hinted_key, Some(None));
    }

    #[tokio::test]
    async fn loads_the_user_once_when_the_default_provider_is_needed_and_passes_it_down() {
        let fixture =
            fixture(user(Some("openai"), false), vec![key("openai", Some(1000), 1)], vec![]);

        resolve(&fixture, None, None, true).await.unwrap();

        let call = only_call(&fixture);
        assert_eq!(call.provider, None);
        assert_eq!(
            call.hinted_user.map(|user| user.map(|user| user.id)),
            Some(Some(USER.to_string()))
        );
    }

    #[tokio::test]
    async fn hands_the_substitute_key_down_when_falling_back() {
        let fixture = fixture(
            user(Some("openai"), true),
            vec![key("openai", Some(1000), 1), key("anthropic", None, 2)],
            vec![usage("openai", 1000, 0, this_month())],
        );

        resolve(&fixture, None, None, true).await.unwrap();

        let call = only_call(&fixture);
        assert_eq!(
            call.hinted_key.map(|key| key.map(|key| key.provider)),
            Some(Some("anthropic".to_string()))
        );
        assert!(call.hinted_user.flatten().is_some());
    }
}
