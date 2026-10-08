use std::sync::Arc;

use async_trait::async_trait;

use crate::domain::llm_api_key::LlmApiKey;
use crate::domain::user::User;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::llm_provider::LLMProvider;

/// Raw, not-yet-persisted credentials: the "test before you save" path.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LLMProviderCredentials {
    pub provider: String,
    pub api_key: String,
    pub model: Option<String>,
    pub base_url: Option<String>,
}

/// What `resolve_for_user` answers: the provider to call, which of the
/// user's keys it is, and, when the one that would normally have run was
/// paused at its monthly limit, which key it stood in for (JEF-258).
#[derive(Clone)]
pub struct LLMProviderResolution {
    pub provider: Arc<dyn LLMProvider>,
    pub provider_id: String,
    /// The paused provider this fell back from, or `None` on the normal path.
    pub fell_back_from: Option<String>,
}

/// Rows a caller already holds (F9). The limit-enforcing decorator has to
/// load the user and every key to decide whether to refuse; without this the
/// inner factory would load the same user and key again. The outer `Option`
/// is "was it looked up": `None` is fetched as before, `Some(None)` is a
/// lookup that found nothing.
#[derive(Debug, Clone, Default)]
pub struct LLMProviderResolveHints {
    pub user: Option<Option<User>>,
    pub key: Option<Option<LlmApiKey>>,
}

/// Resolves the LLM provider to use for a given user's own API key. Answers
/// `None` when the user has not configured one: AI features are simply
/// unavailable in that case, there is no shared or fallback key.
///
/// When `provider` is `None` (or empty), resolves the user's configured
/// default (`User.defaultLlmProvider`), as the automatic AI features do. The
/// assistant passes an explicit provider since each conversation picks its
/// own.
///
/// `model` overrides the model stored on that provider's `LlmApiKey` row,
/// for a conversation that locked in a specific model at creation time.
///
/// `track_usage` gates the usage-recording wrap (JEF-250) and with it the
/// monthly limit. Every real AI feature passes `true`; the one caller that
/// passes `false` is the "test a saved key" path, which is not real usage.
#[async_trait]
pub trait LLMProviderFactory: Send + Sync {
    /// Fails with `AI_LIMIT_REACHED` when the key is past its monthly limit
    /// and no other key may stand in.
    async fn resolve_for_user(
        &self,
        user_id: &str,
        provider: Option<&str>,
        model: Option<&str>,
        track_usage: bool,
        hints: LLMProviderResolveHints,
    ) -> DomainResult<Option<LLMProviderResolution>>;

    /// `resolve_for_user`, for the callers that only need the provider.
    async fn for_user(
        &self,
        user_id: &str,
        provider: Option<&str>,
        model: Option<&str>,
        track_usage: bool,
    ) -> DomainResult<Option<Arc<dyn LLMProvider>>> {
        let resolution = self
            .resolve_for_user(
                user_id,
                provider,
                model,
                track_usage,
                LLMProviderResolveHints::default(),
            )
            .await?;
        Ok(resolution.map(|resolution| resolution.provider))
    }

    /// Builds a provider directly from raw credentials. No database access,
    /// nothing decrypted, never usage-tracked. `Ok(None)` for an
    /// unrecognized `provider` id.
    #[allow(clippy::wrong_self_convention)] // the name is `apps/api`'s
    fn from_credentials(
        &self,
        credentials: LLMProviderCredentials,
    ) -> DomainResult<Option<Arc<dyn LLMProvider>>>;
}
