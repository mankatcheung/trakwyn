use std::sync::Arc;

use super::llm_api_key_validation::{assert_valid_llm_api_key_shape, assert_valid_llm_provider};
use crate::use_cases::constants::{llm, llm_provider};
use crate::use_cases::errors::{DomainError, DomainResult, LlmProviderErrorKind};
use crate::use_cases::ports::outbound_url_policy::{OutboundUrlPolicy, OutboundUrlPurpose};
use crate::use_cases::ports::{
    LLMProvider, LLMProviderCredentials, LLMProviderFactory, LlmCompleteOptions, LlmMessage,
    RateLimiter,
};
use crate::use_cases::shared::js_string::trimmed_or_none;

const TEST_MESSAGE: &str = "Reply with a single word to confirm this connection works.";

pub struct TestLlmApiKeyInput {
    pub user_id: String,
    pub provider: String,
    /// Raw, unsaved key value to test directly (the add-key form, before
    /// `Save`). `None` or blank means test the already-persisted key for
    /// `provider` instead.
    pub api_key: Option<String>,
    /// Optional model override; required when provider is `custom` and `api_key` is given.
    pub model: Option<String>,
    /// Only valid (and required) when provider is `custom` and `api_key` is given.
    pub base_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TestLlmApiKeyResult {
    pub ok: bool,
    /// Why the key did not work, classified rather than quoted from the
    /// provider. `None` on success.
    pub error: Option<String>,
}

/// "Does this key work" ping for Settings → AI (JEF-247): a cheap
/// `complete` call, never a tool-calling one.
///
/// Two ways in, both ending at the same call:
/// - `api_key` given: the add-key form's unsaved values. The provider is
///   built directly via `from_credentials`; nothing is persisted.
/// - `api_key` omitted: an already-saved key, resolved through `for_user`,
///   the same decrypt-and-construct path automatic AI features use.
///
/// Deliberately never fails for "the key doesn't work": a bad key someone is
/// actively testing is not a server error. `ok`/`error` reports that
/// outcome. A `DomainError` stays reserved for genuine failures: our own
/// rate limit, an unrecognized provider id, a base URL the outbound policy
/// refuses, or no key on file to test at all.
pub struct TestLlmApiKeyUseCase {
    pub llm_provider_factory: Arc<dyn LLMProviderFactory>,
    pub test_llm_api_key_rate_limiter: Arc<dyn RateLimiter>,
    pub outbound_url_policy: Arc<dyn OutboundUrlPolicy>,
}

impl TestLlmApiKeyUseCase {
    pub async fn execute(&self, input: TestLlmApiKeyInput) -> DomainResult<TestLlmApiKeyResult> {
        let rate_limit_key = format!("test-llm-api-key:user:{}", input.user_id);
        if !self.test_llm_api_key_rate_limiter.consume(&rate_limit_key).await {
            return Err(DomainError::rate_limited(
                "Too many test attempts — please wait a moment and try again",
            ));
        }

        let provider = match trimmed_or_none(input.api_key.as_deref()) {
            Some(api_key) => self.resolve_unsaved_provider(&input, api_key).await?,
            None => self.resolve_saved_provider(&input.user_id, &input.provider).await?,
        };

        let outcome = provider
            .complete(
                &[LlmMessage::user(TEST_MESSAGE)],
                Some(llm::TEST_API_KEY_MAX_TOKENS),
                LlmCompleteOptions::default(),
            )
            .await;
        Ok(match outcome {
            Ok(_) => TestLlmApiKeyResult { ok: true, error: None },
            // The provider's own words never reach the caller: for a custom
            // base URL the "provider" is whatever the user pointed us at,
            // and echoing its body would make this mutation a way to read
            // any HTTP service the API host can reach. A provider failure's
            // message is per-kind copy; anything else reads as unreachable.
            Err(err) => TestLlmApiKeyResult {
                ok: false,
                error: Some(if err.llm_provider_failure().is_some() {
                    err.to_string()
                } else {
                    LlmProviderErrorKind::Unreachable.user_message().to_string()
                }),
            },
        })
    }

    async fn resolve_unsaved_provider(
        &self,
        input: &TestLlmApiKeyInput,
        api_key: String,
    ) -> DomainResult<Arc<dyn LLMProvider>> {
        let is_custom = input.provider == llm_provider::CUSTOM;
        let base_url = trimmed_or_none(input.base_url.as_deref());
        let model = trimmed_or_none(input.model.as_deref());

        assert_valid_llm_api_key_shape(&input.provider, base_url.as_deref(), model.as_deref())?;
        if let Some(base_url) = base_url.as_deref().filter(|_| is_custom) {
            self.outbound_url_policy
                .assert_allowed(base_url, OutboundUrlPurpose::LlmProvider)
                .await?;
        }
        // The shape is already validated, so `None` here would mean the
        // provider list and the provider registry disagree: a programmer
        // error, not a user-facing "key doesn't work" case.
        self.llm_provider_factory
            .from_credentials(LLMProviderCredentials {
                provider: input.provider.clone(),
                api_key,
                model,
                base_url: if is_custom { base_url } else { None },
            })?
            .ok_or_else(|| {
                DomainError::service_unavailable(format!(
                    "No provider registered for '{}'",
                    input.provider
                ))
            })
    }

    async fn resolve_saved_provider(
        &self,
        user_id: &str,
        provider: &str,
    ) -> DomainResult<Arc<dyn LLMProvider>> {
        assert_valid_llm_provider(provider)?;
        // Untracked: this is a connectivity check, not real usage (JEF-250).
        self.llm_provider_factory
            .for_user(user_id, Some(provider), None, false)
            .await?
            .ok_or_else(|| DomainError::ai_not_configured("No API key saved for this provider yet"))
    }
}
