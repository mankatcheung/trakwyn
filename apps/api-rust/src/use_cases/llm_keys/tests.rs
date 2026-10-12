use std::sync::Arc;

use chrono::{DateTime, Utc};

use super::*;
use crate::domain::llm_api_key::LlmApiKey;
use crate::domain::llm_usage_event::LlmUsageEvent;
use crate::domain::user::User;
use crate::use_cases::errors::{DomainError, ErrorCode, LlmProviderErrorKind, LlmProviderFailure};
use crate::use_cases::ports::outbound_url_policy::OutboundUrlPurpose;
use crate::use_cases::ports::{LlmApiKeyCipher, LlmCompleteOptions, LlmMessage};
use crate::use_cases::test_support::{
    sequential_ids, user_with_email, FakeLLMProvider, FakeLLMProviderFactory, FakeLlmApiKeyCipher,
    FakeLlmApiKeyRepository, FakeLlmCall, FakeLlmUsageEventRepository, FakeOutboundUrlPolicy,
    FakeUserRepository, FixedRateLimiter,
};

const USER: &str = "user-1";
const CUSTOM_URL: &str = "https://llm.example.com/v1/chat/completions";

fn at(text: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(text).unwrap().with_timezone(&Utc)
}

fn user(default_llm_provider: Option<&str>) -> User {
    User {
        default_llm_provider: default_llm_provider.map(str::to_string),
        ..user_with_email(USER, "user@example.com")
    }
}

fn key(provider: &str, limit: Option<i64>) -> LlmApiKey {
    LlmApiKey {
        id: format!("key-{provider}"),
        user_id: USER.to_string(),
        provider: provider.to_string(),
        api_key: "ciphertext".to_string(),
        model: None,
        base_url: None,
        monthly_token_limit: limit,
        created_at: at("2026-01-01T00:00:00Z"),
        updated_at: at("2026-01-01T00:00:00Z"),
    }
}

struct Fixture {
    users: Arc<FakeUserRepository>,
    keys: Arc<FakeLlmApiKeyRepository>,
    policy: Arc<FakeOutboundUrlPolicy>,
}

impl Fixture {
    fn new(users: Vec<User>, keys: Vec<LlmApiKey>) -> Self {
        Self::with_policy(users, keys, FakeOutboundUrlPolicy::allow_all())
    }

    fn with_policy(users: Vec<User>, keys: Vec<LlmApiKey>, policy: FakeOutboundUrlPolicy) -> Self {
        Self {
            users: Arc::new(FakeUserRepository::with(users)),
            keys: Arc::new(FakeLlmApiKeyRepository::with(keys)),
            policy: Arc::new(policy),
        }
    }

    fn save(&self) -> SaveLlmApiKeyUseCase {
        SaveLlmApiKeyUseCase {
            user_repository: self.users.clone(),
            llm_api_key_repository: self.keys.clone(),
            llm_api_key_cipher: Arc::new(FakeLlmApiKeyCipher),
            outbound_url_policy: self.policy.clone(),
            generate_id: sequential_ids("key"),
        }
    }

    fn delete(&self) -> DeleteLlmApiKeyUseCase {
        DeleteLlmApiKeyUseCase {
            user_repository: self.users.clone(),
            llm_api_key_repository: self.keys.clone(),
        }
    }

    fn set_default(&self) -> SetDefaultLlmProviderUseCase {
        SetDefaultLlmProviderUseCase {
            user_repository: self.users.clone(),
            llm_api_key_repository: self.keys.clone(),
        }
    }

    fn set_limit(&self) -> SetLlmApiKeyMonthlyLimitUseCase {
        SetLlmApiKeyMonthlyLimitUseCase { llm_api_key_repository: self.keys.clone() }
    }

    fn default_provider(&self) -> Option<String> {
        self.users.all()[0].default_llm_provider.clone()
    }
}

fn save_input(provider: &str, api_key: &str) -> SaveLlmApiKeyInput {
    SaveLlmApiKeyInput {
        user_id: USER.to_string(),
        provider: provider.to_string(),
        api_key: api_key.to_string(),
        model: None,
        base_url: None,
    }
}

fn custom_input() -> SaveLlmApiKeyInput {
    SaveLlmApiKeyInput {
        model: Some("local-model".to_string()),
        base_url: Some(CUSTOM_URL.to_string()),
        ..save_input("custom", "sk-secret")
    }
}

mod save {
    use super::*;

    async fn rejected(fixture: &Fixture, input: SaveLlmApiKeyInput) -> DomainError {
        let err = fixture.save().execute(input).await.unwrap_err();
        assert!(fixture.keys.all().is_empty(), "nothing may be stored when a save is refused");
        err
    }

    #[tokio::test]
    async fn fails_with_validation_for_an_unsupported_provider() {
        let fixture = Fixture::new(vec![user(None)], vec![]);

        let err = rejected(&fixture, save_input("skynet", "sk-secret")).await;

        assert_eq!(err.code(), ErrorCode::Validation);
        assert_eq!(err.to_string(), "Unsupported AI provider");
    }

    #[tokio::test]
    async fn fails_with_validation_for_a_blank_api_key() {
        let fixture = Fixture::new(vec![user(None)], vec![]);

        let err = rejected(&fixture, save_input("openai", "   ")).await;

        assert_eq!(err.code(), ErrorCode::Validation);
        assert_eq!(err.to_string(), "API key is required");
    }

    #[tokio::test]
    async fn fails_with_not_found_when_the_user_does_not_exist() {
        let fixture = Fixture::new(vec![], vec![]);

        let err = rejected(&fixture, save_input("openai", "sk-secret")).await;

        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "User not found");
    }

    #[tokio::test]
    async fn encrypts_the_trimmed_key_and_upserts_it_under_the_chosen_provider() {
        let fixture = Fixture::new(vec![user(None)], vec![]);

        fixture.save().execute(save_input("anthropic", "  sk-secret \n")).await.unwrap();

        let stored = fixture.keys.all();
        assert_eq!(stored.len(), 1);
        assert_eq!(stored[0].id, "key-1");
        assert_eq!(stored[0].user_id, USER);
        assert_eq!(stored[0].provider, "anthropic");
        assert_ne!(stored[0].api_key, "sk-secret");
        assert!(!stored[0].api_key.contains("sk-secret"));
        assert_eq!(
            FakeLlmApiKeyCipher.decrypt(&stored[0].api_key, "user-1:anthropic").unwrap(),
            "sk-secret"
        );
        assert_eq!(stored[0].model, None);
        assert_eq!(stored[0].base_url, None);
    }

    #[tokio::test]
    async fn saving_again_replaces_the_key_and_keeps_its_limit() {
        let fixture = Fixture::new(vec![user(Some("openai"))], vec![key("openai", Some(500))]);

        fixture.save().execute(save_input("openai", "sk-new")).await.unwrap();

        let stored = fixture.keys.all();
        assert_eq!(stored.len(), 1);
        assert_eq!(stored[0].id, "key-openai");
        assert_eq!(stored[0].monthly_token_limit, Some(500));
        assert_ne!(stored[0].api_key, "ciphertext");
    }

    #[tokio::test]
    async fn makes_the_first_ever_configured_provider_the_default() {
        let fixture = Fixture::new(vec![user(None)], vec![]);

        fixture.save().execute(save_input("groq", "sk-secret")).await.unwrap();

        assert_eq!(fixture.default_provider().as_deref(), Some("groq"));
    }

    #[tokio::test]
    async fn does_not_change_the_default_when_the_user_already_has_one() {
        let fixture = Fixture::new(vec![user(Some("openai"))], vec![key("openai", None)]);

        fixture.save().execute(save_input("groq", "sk-secret")).await.unwrap();

        assert_eq!(fixture.default_provider().as_deref(), Some("openai"));
    }

    #[tokio::test]
    async fn persists_an_optional_trimmed_model_override_for_a_named_provider() {
        let fixture = Fixture::new(vec![user(None)], vec![]);
        let input = SaveLlmApiKeyInput {
            model: Some(" gpt-4o-mini ".to_string()),
            ..save_input("openai", "k")
        };

        fixture.save().execute(input).await.unwrap();

        assert_eq!(fixture.keys.all()[0].model.as_deref(), Some("gpt-4o-mini"));
    }

    #[tokio::test]
    async fn a_blank_model_is_stored_as_none() {
        let fixture = Fixture::new(vec![user(None)], vec![]);
        let input =
            SaveLlmApiKeyInput { model: Some("   ".to_string()), ..save_input("openai", "k") };

        fixture.save().execute(input).await.unwrap();

        assert_eq!(fixture.keys.all()[0].model, None);
    }

    #[tokio::test]
    async fn fails_with_validation_when_a_base_url_is_given_for_a_named_provider() {
        let fixture = Fixture::new(vec![user(None)], vec![]);
        let input = SaveLlmApiKeyInput {
            base_url: Some(CUSTOM_URL.to_string()),
            ..save_input("openai", "k")
        };

        let err = rejected(&fixture, input).await;

        assert_eq!(err.to_string(), "A base URL can only be set for a custom provider");
        assert!(fixture.policy.checks().is_empty());
    }

    #[tokio::test]
    async fn fails_with_validation_when_the_custom_provider_is_missing_a_base_url() {
        let fixture = Fixture::new(vec![user(None)], vec![]);
        let input = SaveLlmApiKeyInput { base_url: Some("  ".to_string()), ..custom_input() };

        let err = rejected(&fixture, input).await;

        assert_eq!(err.code(), ErrorCode::Validation);
        assert_eq!(err.to_string(), "A base URL is required for a custom provider");
    }

    #[tokio::test]
    async fn fails_with_validation_when_the_custom_provider_base_url_is_malformed() {
        let fixture = Fixture::new(vec![user(None)], vec![]);
        let input =
            SaveLlmApiKeyInput { base_url: Some("not a url".to_string()), ..custom_input() };

        let err = rejected(&fixture, input).await;

        assert_eq!(err.to_string(), "Base URL must be a valid http(s) URL");
        assert!(fixture.policy.checks().is_empty());
    }

    #[tokio::test]
    async fn fails_with_validation_when_the_custom_provider_is_missing_a_model() {
        let fixture = Fixture::new(vec![user(None)], vec![]);
        let input = SaveLlmApiKeyInput { model: None, ..custom_input() };

        let err = rejected(&fixture, input).await;

        assert_eq!(err.to_string(), "A model is required for a custom provider");
    }

    #[tokio::test]
    async fn persists_base_url_and_model_for_a_valid_custom_provider() {
        let fixture = Fixture::new(vec![user(None)], vec![]);
        let input =
            SaveLlmApiKeyInput { base_url: Some(format!("  {CUSTOM_URL} ")), ..custom_input() };

        fixture.save().execute(input).await.unwrap();

        let stored = fixture.keys.all();
        assert_eq!(stored[0].provider, "custom");
        assert_eq!(stored[0].base_url.as_deref(), Some(CUSTOM_URL));
        assert_eq!(stored[0].model.as_deref(), Some("local-model"));
    }

    #[tokio::test]
    async fn asks_the_outbound_policy_about_a_custom_base_url_and_refuses_what_it_refuses() {
        let allowed = Fixture::new(vec![user(None)], vec![]);
        allowed.save().execute(custom_input()).await.unwrap();
        assert_eq!(
            allowed.policy.checks(),
            vec![(CUSTOM_URL.to_string(), OutboundUrlPurpose::LlmProvider)]
        );

        let refusing = Fixture::with_policy(
            vec![user(None)],
            vec![],
            FakeOutboundUrlPolicy::refusing(&[CUSTOM_URL]),
        );
        let err = rejected(&refusing, custom_input()).await;
        assert_eq!(err.code(), ErrorCode::Validation);
        assert_eq!(refusing.default_provider(), None);
    }

    #[tokio::test]
    async fn does_not_consult_the_outbound_policy_for_a_named_provider_whose_endpoint_is_fixed() {
        let fixture =
            Fixture::with_policy(vec![user(None)], vec![], FakeOutboundUrlPolicy::refuse_all());

        fixture.save().execute(save_input("openai", "sk-secret")).await.unwrap();

        assert!(fixture.policy.checks().is_empty());
        assert_eq!(fixture.keys.all().len(), 1);
    }

    #[tokio::test]
    async fn refuses_a_model_id_with_path_or_query_characters() {
        let fixture = Fixture::new(vec![user(None)], vec![]);
        let input = SaveLlmApiKeyInput {
            model: Some("../../v1beta/files?x=".to_string()),
            ..save_input("googleai", "k")
        };

        let err = rejected(&fixture, input).await;

        assert_eq!(err.code(), ErrorCode::Validation);
        assert_eq!(err.to_string(), "Model name contains characters that are not allowed");
    }
}

mod delete {
    use super::*;

    fn input(provider: &str) -> DeleteLlmApiKeyInput {
        DeleteLlmApiKeyInput { user_id: USER.to_string(), provider: provider.to_string() }
    }

    #[tokio::test]
    async fn fails_with_not_found_when_the_user_does_not_exist() {
        let fixture = Fixture::new(vec![], vec![key("openai", None)]);

        let err = fixture.delete().execute(input("openai")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "User not found");
        assert_eq!(fixture.keys.all().len(), 1);
    }

    #[tokio::test]
    async fn deletes_the_key_for_the_given_provider_only() {
        let fixture = Fixture::new(
            vec![user(Some("anthropic"))],
            vec![key("openai", None), key("anthropic", None)],
        );

        fixture.delete().execute(input("openai")).await.unwrap();

        let providers: Vec<String> =
            fixture.keys.all().into_iter().map(|key| key.provider).collect();
        assert_eq!(providers, vec!["anthropic"]);
        assert_eq!(fixture.default_provider().as_deref(), Some("anthropic"));
    }

    #[tokio::test]
    async fn clears_the_default_provider_when_the_deleted_key_was_the_default() {
        let fixture = Fixture::new(vec![user(Some("openai"))], vec![key("openai", None)]);

        fixture.delete().execute(input("openai")).await.unwrap();

        assert!(fixture.keys.all().is_empty());
        assert_eq!(fixture.default_provider(), None);
    }
}

mod list {
    use super::*;

    #[tokio::test]
    async fn returns_only_the_users_own_keys() {
        let mut other = key("groq", None);
        other.user_id = "someone-else".to_string();
        let fixture = Fixture::new(vec![user(None)], vec![key("openai", Some(5)), other]);
        let use_case = ListLlmApiKeysUseCase { llm_api_key_repository: fixture.keys.clone() };

        let keys = use_case.execute(USER).await.unwrap();

        assert_eq!(keys, vec![key("openai", Some(5))]);
    }
}

mod set_default {
    use super::*;

    fn input(provider: &str) -> SetDefaultLlmProviderInput {
        SetDefaultLlmProviderInput { user_id: USER.to_string(), provider: provider.to_string() }
    }

    #[tokio::test]
    async fn fails_with_validation_when_the_user_has_no_key_for_that_provider() {
        let fixture = Fixture::new(vec![user(Some("openai"))], vec![key("openai", None)]);

        let err = fixture.set_default().execute(input("anthropic")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Validation);
        assert_eq!(
            err.to_string(),
            "Add an API key for this provider before making it the default"
        );
        assert_eq!(fixture.default_provider().as_deref(), Some("openai"));
    }

    #[tokio::test]
    async fn sets_the_default_provider_when_a_matching_key_exists() {
        let fixture = Fixture::new(
            vec![user(Some("openai"))],
            vec![key("openai", None), key("anthropic", None)],
        );

        fixture.set_default().execute(input("anthropic")).await.unwrap();

        assert_eq!(fixture.default_provider().as_deref(), Some("anthropic"));
    }
}

mod set_monthly_limit {
    use super::*;

    fn input(provider: &str, limit: Option<i64>) -> SetLlmApiKeyMonthlyLimitInput {
        SetLlmApiKeyMonthlyLimitInput {
            user_id: USER.to_string(),
            provider: provider.to_string(),
            monthly_token_limit: limit,
        }
    }

    #[tokio::test]
    async fn sets_the_limit_on_the_named_provider() {
        let fixture =
            Fixture::new(vec![user(None)], vec![key("openai", None), key("anthropic", None)]);

        fixture.set_limit().execute(input("openai", Some(2_000_000))).await.unwrap();

        let keys = fixture.keys.all();
        assert_eq!(keys[0].monthly_token_limit, Some(2_000_000));
        assert_eq!(keys[1].monthly_token_limit, None);
    }

    #[tokio::test]
    async fn clears_the_limit_with_none() {
        let fixture = Fixture::new(vec![user(None)], vec![key("openai", Some(100))]);

        fixture.set_limit().execute(input("openai", None)).await.unwrap();

        assert_eq!(fixture.keys.all()[0].monthly_token_limit, None);
    }

    #[tokio::test]
    async fn rejects_a_zero_or_negative_limit_without_writing() {
        let fixture = Fixture::new(vec![user(None)], vec![key("openai", Some(100))]);

        for limit in [0, -5] {
            let err = fixture.set_limit().execute(input("openai", Some(limit))).await.unwrap_err();
            assert_eq!(err.code(), ErrorCode::Validation);
            assert_eq!(err.to_string(), "Monthly token limit must be at least 1");
        }
        assert_eq!(fixture.keys.all()[0].monthly_token_limit, Some(100));
    }

    #[tokio::test]
    async fn reports_a_provider_the_user_has_no_key_for_as_not_found() {
        let fixture = Fixture::new(vec![user(None)], vec![key("openai", None)]);

        let err = fixture.set_limit().execute(input("anthropic", Some(10))).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::NotFound);
        // The wording is `apps/api`'s: its not-found error appends the suffix
        // to any message that does not already end with it.
        assert_eq!(err.to_string(), "No API key configured for this provider not found");
    }
}

mod usage_summary {
    use super::*;

    fn event(provider: &str, prompt: i32, completion: i32, created_at: &str) -> LlmUsageEvent {
        LlmUsageEvent {
            id: format!("event-{provider}-{created_at}"),
            user_id: USER.to_string(),
            provider: provider.to_string(),
            model: None,
            prompt_tokens: prompt,
            completion_tokens: completion,
            cache_read_tokens: Some(10),
            cache_write_tokens: None,
            estimated: false,
            created_at: at(created_at),
        }
    }

    fn use_case(keys: Vec<LlmApiKey>, events: Vec<LlmUsageEvent>) -> GetLlmUsageSummaryUseCase {
        GetLlmUsageSummaryUseCase {
            llm_usage_event_repository: Arc::new(FakeLlmUsageEventRepository::with(events)),
            llm_api_key_repository: Arc::new(FakeLlmApiKeyRepository::with(keys)),
            now: Arc::new(|| at("2026-07-17T12:00:00Z")),
        }
    }

    #[tokio::test]
    async fn counts_only_events_from_the_start_of_the_current_utc_month() {
        let summaries = use_case(
            vec![key("openai", None)],
            vec![
                event("openai", 900, 90, "2026-06-30T23:59:59.999Z"),
                event("openai", 100, 20, "2026-07-01T00:00:00Z"),
                event("openai", 5, 1, "2026-07-10T00:00:00Z"),
            ],
        )
        .execute(USER)
        .await
        .unwrap();

        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].request_count, 2);
        assert_eq!(summaries[0].prompt_tokens, 105);
        assert_eq!(summaries[0].completion_tokens, 21);
    }

    #[tokio::test]
    async fn carries_the_counts_through_unchanged() {
        let summaries = use_case(
            vec![key("openai", None)],
            vec![event("openai", 100, 20, "2026-07-02T08:00:00Z")],
        )
        .execute(USER)
        .await
        .unwrap();

        assert_eq!(summaries[0].provider, "openai");
        assert_eq!(summaries[0].cache_read_tokens, 10);
        assert_eq!(summaries[0].cache_write_tokens, 0);
        assert_eq!(summaries[0].last_used_at, at("2026-07-02T08:00:00Z"));
    }

    #[tokio::test]
    async fn reports_no_limit_when_the_key_has_none() {
        let summaries = use_case(
            vec![key("openai", None)],
            vec![event("openai", 9_000_000, 0, "2026-07-02T08:00:00Z")],
        )
        .execute(USER)
        .await
        .unwrap();

        assert_eq!(summaries[0].monthly_token_limit, None);
        assert!(!summaries[0].limit_reached);
    }

    #[tokio::test]
    async fn reports_the_limit_as_not_reached_while_usage_is_below_it() {
        let summaries = use_case(
            vec![key("openai", Some(1000))],
            vec![event("openai", 600, 399, "2026-07-02T08:00:00Z")],
        )
        .execute(USER)
        .await
        .unwrap();

        assert_eq!(summaries[0].monthly_token_limit, Some(1000));
        assert!(!summaries[0].limit_reached);
    }

    #[tokio::test]
    async fn reports_the_limit_as_reached_once_the_combined_tokens_meet_or_pass_it() {
        for completion in [400, 4000] {
            let summaries = use_case(
                vec![key("openai", Some(1000))],
                vec![event("openai", 600, completion, "2026-07-02T08:00:00Z")],
            )
            .execute(USER)
            .await
            .unwrap();

            assert!(summaries[0].limit_reached, "{completion}");
        }
    }

    #[tokio::test]
    async fn reports_no_limit_for_usage_whose_key_is_gone() {
        let summaries = use_case(
            vec![key("anthropic", Some(1))],
            vec![event("openai", 600, 400, "2026-07-02T08:00:00Z")],
        )
        .execute(USER)
        .await
        .unwrap();

        assert_eq!(summaries[0].monthly_token_limit, None);
        assert!(!summaries[0].limit_reached);
    }
}

mod test_key {
    use super::*;

    struct TestFixture {
        model: Arc<FakeLLMProvider>,
        factory: Arc<FakeLLMProviderFactory>,
        limiter: Arc<FixedRateLimiter>,
        policy: Arc<FakeOutboundUrlPolicy>,
    }

    impl TestFixture {
        fn new(model: FakeLLMProvider) -> Self {
            let model = Arc::new(model);
            Self {
                factory: Arc::new(FakeLLMProviderFactory::with_provider(model.clone())),
                model,
                limiter: Arc::new(FixedRateLimiter::allowing()),
                policy: Arc::new(FakeOutboundUrlPolicy::allow_all()),
            }
        }

        fn use_case(&self) -> TestLlmApiKeyUseCase {
            TestLlmApiKeyUseCase {
                llm_provider_factory: self.factory.clone(),
                test_llm_api_key_rate_limiter: self.limiter.clone(),
                outbound_url_policy: self.policy.clone(),
            }
        }
    }

    fn input(provider: &str, api_key: Option<&str>) -> TestLlmApiKeyInput {
        TestLlmApiKeyInput {
            user_id: USER.to_string(),
            provider: provider.to_string(),
            api_key: api_key.map(str::to_string),
            model: None,
            base_url: None,
        }
    }

    fn custom(api_key: &str) -> TestLlmApiKeyInput {
        TestLlmApiKeyInput {
            model: Some(" local-model ".to_string()),
            base_url: Some(format!(" {CUSTOM_URL} ")),
            ..input("custom", Some(api_key))
        }
    }

    #[tokio::test]
    async fn fails_with_rate_limited_when_the_limiter_denies_the_attempt() {
        let mut fixture = TestFixture::new(FakeLLMProvider::new().reply("ok"));
        fixture.limiter = Arc::new(FixedRateLimiter::rejecting());

        let err = fixture.use_case().execute(input("openai", None)).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::RateLimited);
        assert_eq!(err.to_string(), "Too many test attempts — please wait a moment and try again");
        assert_eq!(fixture.limiter.keys(), vec!["test-llm-api-key:user:user-1"]);
        assert!(fixture.factory.resolve_calls().is_empty());
    }

    #[tokio::test]
    async fn fails_with_validation_for_an_unsupported_provider_on_either_path() {
        let fixture = TestFixture::new(FakeLLMProvider::new());

        for api_key in [None, Some("sk-unsaved")] {
            let err = fixture.use_case().execute(input("skynet", api_key)).await.unwrap_err();
            assert_eq!(err.code(), ErrorCode::Validation);
            assert_eq!(err.to_string(), "Unsupported AI provider");
        }
        assert!(fixture.model.calls().is_empty());
    }

    #[tokio::test]
    async fn fails_with_validation_when_a_custom_provider_is_missing_a_base_url() {
        let fixture = TestFixture::new(FakeLLMProvider::new());
        let input = TestLlmApiKeyInput { base_url: None, ..custom("sk-unsaved") };

        let err = fixture.use_case().execute(input).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Validation);
        assert_eq!(err.to_string(), "A base URL is required for a custom provider");
        assert!(fixture.factory.credentials_calls().is_empty());
    }

    #[tokio::test]
    async fn fails_with_ai_not_configured_when_no_key_is_saved_and_none_was_given() {
        let mut fixture = TestFixture::new(FakeLLMProvider::new());
        fixture.factory = Arc::new(FakeLLMProviderFactory::default());

        let err = fixture.use_case().execute(input("openai", None)).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::AiNotConfigured);
        assert_eq!(err.to_string(), "No API key saved for this provider yet");
    }

    #[tokio::test]
    async fn a_blank_api_key_means_test_the_saved_one_untracked() {
        let fixture = TestFixture::new(FakeLLMProvider::new().reply("pong"));

        let result = fixture.use_case().execute(input("anthropic", Some("   "))).await.unwrap();

        assert_eq!(result, TestLlmApiKeyResult { ok: true, error: None });
        let calls = fixture.factory.resolve_calls();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].user_id, USER);
        assert_eq!(calls[0].provider.as_deref(), Some("anthropic"));
        assert_eq!(calls[0].model, None);
        assert!(!calls[0].track_usage);
        assert!(fixture.factory.credentials_calls().is_empty());
    }

    #[tokio::test]
    async fn sends_one_cheap_untooled_completion() {
        let fixture = TestFixture::new(FakeLLMProvider::new().reply("pong"));

        fixture.use_case().execute(input("openai", None)).await.unwrap();

        assert_eq!(
            fixture.model.calls(),
            vec![FakeLlmCall::Complete {
                messages: vec![LlmMessage::user(
                    "Reply with a single word to confirm this connection works."
                )],
                max_tokens: Some(5),
                options: LlmCompleteOptions { json: false },
            }]
        );
    }

    #[tokio::test]
    async fn builds_the_provider_from_credentials_when_a_key_is_given_without_touching_the_saved_one(
    ) {
        let fixture = TestFixture::new(FakeLLMProvider::new().reply("pong"));
        let input = TestLlmApiKeyInput {
            model: Some("gpt-4o-mini".to_string()),
            ..input("openai", Some("  sk-unsaved  "))
        };

        let result = fixture.use_case().execute(input).await.unwrap();

        assert!(result.ok);
        assert!(fixture.factory.resolve_calls().is_empty());
        let credentials = fixture.factory.credentials_calls();
        assert_eq!(credentials.len(), 1);
        assert_eq!(credentials[0].provider, "openai");
        assert_eq!(credentials[0].api_key, "sk-unsaved");
        assert_eq!(credentials[0].model.as_deref(), Some("gpt-4o-mini"));
        assert_eq!(credentials[0].base_url, None);
        assert!(fixture.policy.checks().is_empty());
    }

    #[tokio::test]
    async fn passes_the_trimmed_base_url_and_model_through_for_a_custom_provider() {
        let fixture = TestFixture::new(FakeLLMProvider::new().reply("pong"));

        fixture.use_case().execute(custom("sk-unsaved")).await.unwrap();

        let credentials = fixture.factory.credentials_calls();
        assert_eq!(credentials[0].base_url.as_deref(), Some(CUSTOM_URL));
        assert_eq!(credentials[0].model.as_deref(), Some("local-model"));
        assert_eq!(
            fixture.policy.checks(),
            vec![(CUSTOM_URL.to_string(), OutboundUrlPurpose::LlmProvider)]
        );
    }

    #[tokio::test]
    async fn reports_a_rejected_key_with_classified_copy_never_the_provider_body() {
        let failure = LlmProviderFailure::new(LlmProviderErrorKind::Auth)
            .provider("OpenAI")
            .status(401)
            .detail(Some("{\"error\":\"Incorrect API key provided: sk-unsaved\"}".to_string()));
        let fixture =
            TestFixture::new(FakeLLMProvider::new().fail(DomainError::llm_provider(failure)));

        let result = fixture.use_case().execute(input("openai", Some("sk-unsaved"))).await.unwrap();

        assert!(!result.ok);
        let error = result.error.unwrap();
        assert_eq!(
            error,
            "The provider rejected this API key — check it in Settings and try again (OpenAI error 401)"
        );
        assert!(!error.contains("sk-unsaved"));
        assert!(!error.contains("Incorrect API key"));
    }

    #[tokio::test]
    async fn reports_any_other_failure_as_unreachable_without_quoting_the_underlying_error() {
        for failure in [
            DomainError::internal("connect ECONNREFUSED 10.0.0.5:6379"),
            DomainError::validation("URL host is not allowed"),
            DomainError::ai_provider_error("<html>internal admin page</html>"),
        ] {
            let fixture = TestFixture::new(FakeLLMProvider::new().fail(failure));

            let result = fixture.use_case().execute(input("openai", None)).await.unwrap();

            assert_eq!(
                result,
                TestLlmApiKeyResult {
                    ok: false,
                    error: Some(
                        "Could not reach the provider — check the base URL and try again"
                            .to_string()
                    ),
                }
            );
        }
    }

    #[tokio::test]
    async fn refuses_a_custom_base_url_the_outbound_policy_rejects_before_building_a_provider() {
        let mut fixture = TestFixture::new(FakeLLMProvider::new().reply("pong"));
        fixture.policy = Arc::new(FakeOutboundUrlPolicy::refusing(&[CUSTOM_URL]));

        let err = fixture.use_case().execute(custom("sk-unsaved")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Validation);
        assert!(fixture.factory.credentials_calls().is_empty());
        assert!(fixture.model.calls().is_empty());
    }

    #[tokio::test]
    async fn a_valid_provider_the_registry_does_not_know_is_a_server_fault() {
        let mut fixture = TestFixture::new(FakeLLMProvider::new());
        fixture.factory = Arc::new(FakeLLMProviderFactory::default());

        let err =
            fixture.use_case().execute(input("openai", Some("sk-unsaved"))).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::ServiceUnavailable);
        assert_eq!(err.to_string(), "No provider registered for 'openai'");
    }
}
