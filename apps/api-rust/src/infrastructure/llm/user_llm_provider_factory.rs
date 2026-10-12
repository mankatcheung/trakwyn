use std::sync::Arc;

use async_trait::async_trait;

use crate::infrastructure::llm::fetch_with_retry::LlmTransport;
use crate::infrastructure::llm::provider_registry::{
    provider_registry_entry, LlmProviderCreateParams,
};
use crate::infrastructure::llm::usage_tracking_llm_provider::{
    UsageTrackingDeps, UsageTrackingLLMProvider,
};
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ids::GenerateId;
use crate::use_cases::llm_keys::llm_api_key_cipher_context::llm_api_key_cipher_context;
use crate::use_cases::ports::llm_api_key_cipher::LlmApiKeyCipher;
use crate::use_cases::ports::llm_api_key_repository::LlmApiKeyRepository;
use crate::use_cases::ports::llm_provider::LLMProvider;
use crate::use_cases::ports::llm_provider_factory::{
    LLMProviderCredentials, LLMProviderFactory, LLMProviderResolution, LLMProviderResolveHints,
};
use crate::use_cases::ports::llm_usage_event_repository::LlmUsageEventRepository;
use crate::use_cases::ports::logger::Logger;
use crate::use_cases::ports::outbound_url_policy::OutboundUrlPolicy;
use crate::use_cases::ports::user_repository::UserRepository;

/// Resolves exactly the key it is asked for and never falls back:
/// `fell_back_from` is always `None` here. The limit-enforcing decorator is
/// what can substitute a different key (JEF-258).
pub struct UserLLMProviderFactory {
    pub user_repository: Arc<dyn UserRepository>,
    pub llm_api_key_repository: Arc<dyn LlmApiKeyRepository>,
    pub llm_api_key_cipher: Arc<dyn LlmApiKeyCipher>,
    pub llm_usage_event_repository: Arc<dyn LlmUsageEventRepository>,
    pub outbound_url_policy: Arc<dyn OutboundUrlPolicy>,
    pub generate_id: GenerateId,
    pub logger: Arc<dyn Logger>,
    pub transport: LlmTransport,
}

#[async_trait]
impl LLMProviderFactory for UserLLMProviderFactory {
    async fn resolve_for_user(
        &self,
        user_id: &str,
        provider: Option<&str>,
        model: Option<&str>,
        track_usage: bool,
        hints: LLMProviderResolveHints,
    ) -> DomainResult<Option<LLMProviderResolution>> {
        let resolved_provider = match provider.filter(|provider| !provider.is_empty()) {
            Some(provider) => Some(provider.to_string()),
            None => {
                let user = match hints.user {
                    Some(user) => user,
                    None => self.user_repository.find_by_id(user_id).await?,
                };
                user.and_then(|user| user.default_llm_provider)
                    .filter(|provider| !provider.is_empty())
            }
        };
        let Some(resolved_provider) = resolved_provider else { return Ok(None) };

        // A hinted key is only trusted for the provider it was asked for.
        let key = match hints.key {
            Some(Some(key)) if key.provider == resolved_provider => Some(key),
            _ => {
                self.llm_api_key_repository
                    .find_by_user_id_and_provider(user_id, &resolved_provider)
                    .await?
            }
        };
        let Some(key) = key else { return Ok(None) };

        let Some(entry) = provider_registry_entry(&resolved_provider) else { return Ok(None) };

        let api_key = self
            .llm_api_key_cipher
            .decrypt(&key.api_key, &llm_api_key_cipher_context(&key.user_id, &key.provider))?;
        let resolved_model = model.map(str::to_string).or(key.model);
        let raw_provider = entry.create(LlmProviderCreateParams {
            api_key,
            model: resolved_model.clone(),
            base_url: key.base_url,
            outbound_url_policy: Some(self.outbound_url_policy.clone()),
            transport: self.transport.clone(),
        })?;
        if !track_usage {
            return Ok(Some(LLMProviderResolution {
                provider: raw_provider,
                provider_id: resolved_provider,
                fell_back_from: None,
            }));
        }

        // SEAM (observability, JEF-113): `apps/api` wraps `raw_provider` in
        // `TracingLLMProvider` here when observability is enabled. Tracing
        // sits beneath usage tracking, so the span times the provider rather
        // than the ledger insert that follows it. Not ported yet: when it
        // is, wrap `raw_provider` on this line and hand the result to
        // `UsageTrackingLLMProvider` as `inner`.
        let measured = raw_provider;
        let tracked: Arc<dyn LLMProvider> =
            Arc::new(UsageTrackingLLMProvider::new(UsageTrackingDeps {
                inner: measured,
                usage_event_repository: self.llm_usage_event_repository.clone(),
                generate_id: self.generate_id.clone(),
                logger: self.logger.clone(),
                user_id: user_id.to_string(),
                provider: resolved_provider.clone(),
                model: resolved_model,
            }));
        Ok(Some(LLMProviderResolution {
            provider: tracked,
            provider_id: resolved_provider,
            fell_back_from: None,
        }))
    }

    fn from_credentials(
        &self,
        credentials: LLMProviderCredentials,
    ) -> DomainResult<Option<Arc<dyn LLMProvider>>> {
        let Some(entry) = provider_registry_entry(&credentials.provider) else { return Ok(None) };
        entry
            .create(LlmProviderCreateParams {
                api_key: credentials.api_key,
                model: credentials.model,
                base_url: credentials.base_url,
                outbound_url_policy: Some(self.outbound_url_policy.clone()),
                transport: self.transport.clone(),
            })
            .map(Some)
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::domain::llm_api_key::LlmApiKey;
    use crate::domain::user::User;
    use crate::infrastructure::llm::stub_server::{fast_transport, StubReply, StubServer};
    use crate::infrastructure::llm::AesGcmLlmApiKeyCipher;
    use crate::use_cases::clock::now;
    use crate::use_cases::errors::ErrorCode;
    use crate::use_cases::ports::llm_provider::{LlmCompleteOptions, LlmMessage};
    use crate::use_cases::test_support::{
        sequential_ids, user_with_email, FakeLlmApiKeyRepository, FakeLlmUsageEventRepository,
        FakeLogger, FakeOutboundUrlPolicy, FakeUserRepository,
    };

    const USER: &str = "user-1";

    struct Fixture {
        users: Arc<FakeUserRepository>,
        keys: Arc<FakeLlmApiKeyRepository>,
        events: Arc<FakeLlmUsageEventRepository>,
        cipher: Arc<AesGcmLlmApiKeyCipher>,
        factory: UserLLMProviderFactory,
    }

    fn cipher() -> Arc<AesGcmLlmApiKeyCipher> {
        Arc::new(AesGcmLlmApiKeyCipher::new("a test passphrase"))
    }

    fn user(default_llm_provider: Option<&str>) -> User {
        User {
            default_llm_provider: default_llm_provider.map(str::to_string),
            ..user_with_email(USER, "user@example.com")
        }
    }

    fn key(
        cipher: &AesGcmLlmApiKeyCipher,
        provider: &str,
        model: Option<&str>,
        base_url: Option<&str>,
    ) -> LlmApiKey {
        LlmApiKey {
            id: format!("key-{provider}"),
            user_id: USER.to_string(),
            provider: provider.to_string(),
            api_key: cipher.encrypt("sk-secret", &format!("{USER}:{provider}")).unwrap(),
            model: model.map(str::to_string),
            base_url: base_url.map(str::to_string),
            monthly_token_limit: None,
            created_at: now(),
            updated_at: now(),
        }
    }

    fn fixture(
        users: Vec<User>,
        keys: impl FnOnce(&AesGcmLlmApiKeyCipher) -> Vec<LlmApiKey>,
    ) -> Fixture {
        let cipher = cipher();
        let users = Arc::new(FakeUserRepository::with(users));
        let keys = Arc::new(FakeLlmApiKeyRepository::with(keys(&cipher)));
        let events = Arc::new(FakeLlmUsageEventRepository::default());
        let factory = UserLLMProviderFactory {
            user_repository: users.clone(),
            llm_api_key_repository: keys.clone(),
            llm_api_key_cipher: cipher.clone(),
            llm_usage_event_repository: events.clone(),
            outbound_url_policy: Arc::new(FakeOutboundUrlPolicy::allow_all()),
            generate_id: sequential_ids("usage"),
            logger: Arc::new(FakeLogger::default()),
            transport: fast_transport(),
        };
        Fixture { users, keys, events, cipher, factory }
    }

    fn completion() -> StubReply {
        StubReply::json(
            200,
            json!({
                "choices": [{ "message": { "content": "pong" }, "finish_reason": "stop" }],
                "usage": { "prompt_tokens": 11, "completion_tokens": 3 }
            }),
        )
    }

    async fn resolve(
        fixture: &Fixture,
        provider: Option<&str>,
        model: Option<&str>,
        track_usage: bool,
    ) -> Option<LLMProviderResolution> {
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
            .unwrap()
    }

    async fn ping(provider: &Arc<dyn LLMProvider>) {
        provider
            .complete(&[LlmMessage::user("ping")], None, LlmCompleteOptions::default())
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn returns_none_when_no_provider_is_given_and_the_user_has_no_default_configured() {
        let fixture = fixture(vec![user(None)], |cipher| vec![key(cipher, "openai", None, None)]);

        assert!(resolve(&fixture, None, None, true).await.is_none());
    }

    #[tokio::test]
    async fn returns_none_when_the_user_does_not_exist_and_no_provider_is_given() {
        let fixture = fixture(vec![], |_| vec![]);

        assert!(resolve(&fixture, None, None, true).await.is_none());
    }

    #[tokio::test]
    async fn returns_none_when_no_key_row_exists_for_the_resolved_provider() {
        let fixture = fixture(vec![user(Some("openai"))], |_| vec![]);

        assert!(resolve(&fixture, None, None, true).await.is_none());
        assert!(fixture
            .factory
            .for_user(USER, Some("anthropic"), None, true)
            .await
            .unwrap()
            .is_none());
    }

    #[tokio::test]
    async fn returns_none_when_the_stored_provider_is_not_in_the_registry() {
        let fixture =
            fixture(vec![user(Some("retired"))], |cipher| vec![key(cipher, "retired", None, None)]);

        assert!(resolve(&fixture, None, None, true).await.is_none());
    }

    #[tokio::test]
    async fn resolves_the_default_provider_when_none_is_passed_explicitly() {
        let fixture = fixture(vec![user(Some("anthropic"))], |cipher| {
            vec![key(cipher, "openai", None, None), key(cipher, "anthropic", None, None)]
        });

        let resolution = resolve(&fixture, None, None, true).await.unwrap();

        assert_eq!(resolution.provider_id, "anthropic");
        assert_eq!(resolution.fell_back_from, None);
    }

    #[tokio::test]
    async fn an_empty_provider_means_the_default() {
        let fixture =
            fixture(vec![user(Some("openai"))], |cipher| vec![key(cipher, "openai", None, None)]);

        assert_eq!(resolve(&fixture, Some(""), None, true).await.unwrap().provider_id, "openai");
    }

    #[tokio::test]
    async fn uses_the_explicitly_passed_provider_without_consulting_the_user_default() {
        // No user row at all: an explicit provider never needs one.
        let fixture = fixture(vec![], |cipher| vec![key(cipher, "groq", None, None)]);

        assert_eq!(resolve(&fixture, Some("groq"), None, true).await.unwrap().provider_id, "groq");
    }

    #[tokio::test]
    async fn every_vendor_in_the_registry_resolves_from_a_stored_key() {
        for provider in ["openrouter", "googleai", "mistral", "xai", "deepseek", "nvidia"] {
            let fixture = fixture(vec![], |cipher| vec![key(cipher, provider, None, None)]);

            assert!(resolve(&fixture, Some(provider), None, true).await.is_some(), "{provider}");
        }
    }

    #[tokio::test]
    async fn builds_the_custom_provider_from_the_stored_base_url_and_model_and_decrypted_key() {
        let server = StubServer::start(vec![completion()]).await;
        let url = server.url("/v1/chat/completions");
        let fixture = fixture(vec![user(Some("custom"))], |cipher| {
            vec![key(cipher, "custom", Some("local-model"), Some(&url))]
        });

        let resolution = resolve(&fixture, None, None, true).await.unwrap();
        ping(&resolution.provider).await;

        let request = server.only_request();
        assert_eq!(request.uri, "/v1/chat/completions");
        assert_eq!(request.header("authorization"), Some("Bearer sk-secret"));
        assert_eq!(request.json()["model"], "local-model");
    }

    #[tokio::test]
    async fn overrides_the_stored_model_when_an_explicit_model_is_passed() {
        let server = StubServer::start(vec![completion()]).await;
        let url = server.url("/v1/chat/completions");
        let fixture =
            fixture(vec![], |cipher| vec![key(cipher, "custom", Some("stored-model"), Some(&url))]);

        let resolution =
            resolve(&fixture, Some("custom"), Some("pinned-model"), true).await.unwrap();
        ping(&resolution.provider).await;

        assert_eq!(server.only_request().json()["model"], "pinned-model");
        assert_eq!(fixture.events.all()[0].model.as_deref(), Some("pinned-model"));
    }

    #[tokio::test]
    async fn wraps_the_resolved_provider_so_it_records_usage_after_a_call_by_default() {
        let server = StubServer::start(vec![completion()]).await;
        let url = server.url("/v1/chat/completions");
        let fixture =
            fixture(vec![], |cipher| vec![key(cipher, "custom", Some("local-model"), Some(&url))]);

        let provider = fixture.factory.for_user(USER, Some("custom"), None, true).await.unwrap();
        ping(&provider.unwrap()).await;

        let events = fixture.events.all();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].user_id, USER);
        assert_eq!(events[0].provider, "custom");
        assert_eq!(events[0].model.as_deref(), Some("local-model"));
        assert_eq!((events[0].prompt_tokens, events[0].completion_tokens), (11, 3));
    }

    #[tokio::test]
    async fn returns_the_raw_provider_unwrapped_when_track_usage_is_false() {
        let server = StubServer::start(vec![completion()]).await;
        let url = server.url("/v1/chat/completions");
        let fixture =
            fixture(vec![], |cipher| vec![key(cipher, "custom", Some("local-model"), Some(&url))]);

        let provider = fixture.factory.for_user(USER, Some("custom"), None, false).await.unwrap();
        ping(&provider.unwrap()).await;

        assert_eq!(server.request_count(), 1);
        assert!(fixture.events.all().is_empty());
    }

    #[tokio::test]
    async fn skips_the_user_and_key_lookups_when_both_are_hinted() {
        // Neither repository holds anything: only the hints can satisfy this.
        let fixture = fixture(vec![], |_| vec![]);
        let hints = LLMProviderResolveHints {
            user: Some(Some(user(Some("openai")))),
            key: Some(Some(key(&fixture.cipher, "openai", None, None))),
        };

        let resolution =
            fixture.factory.resolve_for_user(USER, None, None, true, hints).await.unwrap();

        assert_eq!(resolution.unwrap().provider_id, "openai");
    }

    #[tokio::test]
    async fn a_hinted_absent_user_is_not_looked_up_again() {
        let fixture =
            fixture(vec![user(Some("openai"))], |cipher| vec![key(cipher, "openai", None, None)]);
        let hints = LLMProviderResolveHints { user: Some(None), key: None };

        let resolution =
            fixture.factory.resolve_for_user(USER, None, None, true, hints).await.unwrap();

        assert!(resolution.is_none());
        assert_eq!(fixture.users.all().len(), 1);
    }

    #[tokio::test]
    async fn ignores_a_hinted_key_for_a_different_provider_and_looks_the_right_one_up() {
        let fixture = fixture(vec![], |cipher| vec![key(cipher, "anthropic", None, None)]);
        let hints = LLMProviderResolveHints {
            user: None,
            key: Some(Some(key(&fixture.cipher, "openai", None, None))),
        };

        let resolution = fixture
            .factory
            .resolve_for_user(USER, Some("anthropic"), None, true, hints)
            .await
            .unwrap();

        assert_eq!(resolution.unwrap().provider_id, "anthropic");
        assert_eq!(fixture.keys.all().len(), 1);
    }

    #[tokio::test]
    async fn a_key_copied_from_another_row_fails_to_decrypt() {
        let fixture = fixture(vec![], |cipher| {
            let mut copied = key(cipher, "openai", None, None);
            copied.provider = "anthropic".to_string();
            vec![copied]
        });

        let result = fixture
            .factory
            .resolve_for_user(
                USER,
                Some("anthropic"),
                None,
                true,
                LLMProviderResolveHints::default(),
            )
            .await;

        assert_eq!(result.err().map(|err| err.code()), Some(ErrorCode::InternalError));
    }

    #[tokio::test]
    async fn from_credentials_builds_a_provider_without_touching_storage() {
        let server = StubServer::start(vec![completion()]).await;
        let fixture = fixture(vec![], |_| vec![]);

        let provider = fixture
            .factory
            .from_credentials(LLMProviderCredentials {
                provider: "custom".to_string(),
                api_key: "sk-unsaved".to_string(),
                model: Some("local-model".to_string()),
                base_url: Some(server.url("/v1/chat/completions")),
            })
            .unwrap()
            .unwrap();
        ping(&provider).await;

        assert_eq!(server.only_request().header("authorization"), Some("Bearer sk-unsaved"));
        assert!(fixture.events.all().is_empty());
    }

    #[tokio::test]
    async fn from_credentials_returns_none_for_an_unrecognized_provider() {
        let fixture = fixture(vec![], |_| vec![]);

        let provider = fixture
            .factory
            .from_credentials(LLMProviderCredentials {
                provider: "nope".to_string(),
                api_key: "k".to_string(),
                model: None,
                base_url: None,
            })
            .unwrap();

        assert!(provider.is_none());
    }
}
