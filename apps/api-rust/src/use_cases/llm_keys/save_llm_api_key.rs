use std::sync::Arc;

use super::llm_api_key_cipher_context::llm_api_key_cipher_context;
use super::llm_api_key_validation::assert_valid_llm_api_key_shape;
use crate::use_cases::constants::llm_provider;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::outbound_url_policy::{OutboundUrlPolicy, OutboundUrlPurpose};
use crate::use_cases::ports::{
    LlmApiKeyCipher, LlmApiKeyRepository, UpdateUserData, UpsertLlmApiKeyData, UserRepository,
};
use crate::use_cases::shared::js_string::{js_trim, trimmed_or_none};

pub struct SaveLlmApiKeyInput {
    pub user_id: String,
    pub provider: String,
    pub api_key: String,
    /// Optional model override for named providers; required when provider is `custom`.
    pub model: Option<String>,
    /// Only valid (and required) when provider is `custom`.
    pub base_url: Option<String>,
}

pub struct SaveLlmApiKeyUseCase {
    pub user_repository: Arc<dyn UserRepository>,
    pub llm_api_key_repository: Arc<dyn LlmApiKeyRepository>,
    pub llm_api_key_cipher: Arc<dyn LlmApiKeyCipher>,
    pub outbound_url_policy: Arc<dyn OutboundUrlPolicy>,
    pub generate_id: GenerateId,
}

impl SaveLlmApiKeyUseCase {
    pub async fn execute(&self, input: SaveLlmApiKeyInput) -> DomainResult<()> {
        let is_custom = input.provider == llm_provider::CUSTOM;
        let base_url = trimmed_or_none(input.base_url.as_deref());
        let model = trimmed_or_none(input.model.as_deref());

        assert_valid_llm_api_key_shape(&input.provider, base_url.as_deref(), model.as_deref())?;

        let api_key = js_trim(&input.api_key);
        if api_key.is_empty() {
            return Err(DomainError::validation("API key is required"));
        }
        // Checked here so the settings form hears "no" immediately, and again
        // by the provider on every call, since a hostname can be re-pointed
        // later.
        if let Some(base_url) = base_url.as_deref().filter(|_| is_custom) {
            self.outbound_url_policy
                .assert_allowed(base_url, OutboundUrlPurpose::LlmProvider)
                .await?;
        }

        let user = self
            .user_repository
            .find_by_id(&input.user_id)
            .await?
            .ok_or_else(|| DomainError::not_found("User not found"))?;

        self.llm_api_key_repository
            .upsert(UpsertLlmApiKeyData {
                id: (self.generate_id)(),
                user_id: input.user_id.clone(),
                provider: input.provider.clone(),
                api_key: self.llm_api_key_cipher.encrypt(
                    api_key,
                    &llm_api_key_cipher_context(&input.user_id, &input.provider),
                )?,
                model,
                base_url: if is_custom { base_url } else { None },
            })
            .await?;

        // The first key ever configured becomes the default for automatic
        // features. Otherwise there would be no default at all until the
        // user visits settings to pick one, silently disabling cover
        // letters, JD parsing and resume match.
        if user.default_llm_provider.as_deref().is_none_or(str::is_empty) {
            self.user_repository
                .update(
                    &input.user_id,
                    UpdateUserData {
                        default_llm_provider: Some(Some(input.provider)),
                        ..UpdateUserData::default()
                    },
                )
                .await?;
        }
        Ok(())
    }
}
