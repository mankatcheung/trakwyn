//! One entry per supported provider. Adding a provider is a registry entry,
//! not new branching in the factory that consumes this. Most entries reuse
//! [`OpenAICompatibleLLMProvider`], since they all implement OpenAI's
//! `/chat/completions` shape; only Anthropic and Google AI need their own
//! adapters.

use std::sync::Arc;

use crate::infrastructure::llm::anthropic::AnthropicLLMProvider;
use crate::infrastructure::llm::fetch_with_retry::LlmTransport;
use crate::infrastructure::llm::google_ai::GoogleAILLMProvider;
use crate::infrastructure::llm::openai_compatible::OpenAICompatibleLLMProvider;
use crate::use_cases::constants::llm_provider;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::llm_provider::LLMProvider;
use crate::use_cases::ports::outbound_url_policy::OutboundUrlPolicy;

const OPENAI_API_URL: &str = "https://api.openai.com/v1/chat/completions";
/// OpenAI's cost-tier model per its model list (checked 2026-09-06).
const OPENAI_DEFAULT_MODEL: &str = "gpt-5.6-luna";
const OPENROUTER_API_URL: &str = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_DEFAULT_MODEL: &str = "openai/gpt-4o-mini";
const MISTRAL_API_URL: &str = "https://api.mistral.ai/v1/chat/completions";
const MISTRAL_DEFAULT_MODEL: &str = "mistral-small-latest";
const GROQ_API_URL: &str = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_DEFAULT_MODEL: &str = "llama-3.3-70b-versatile";
const XAI_API_URL: &str = "https://api.x.ai/v1/chat/completions";
/// xAI's cheapest general-purpose Grok per its model list (checked 2026-09-06).
const XAI_DEFAULT_MODEL: &str = "grok-4.3";
const DEEPSEEK_API_URL: &str = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_DEFAULT_MODEL: &str = "deepseek-chat";
const NVIDIA_API_URL: &str = "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_DEFAULT_MODEL: &str = "meta/llama-3.1-8b-instruct";

#[derive(Clone)]
pub struct LlmProviderCreateParams {
    pub api_key: String,
    /// `model` and `base_url` are the user's stored overrides: `None` unless explicitly set.
    pub model: Option<String>,
    pub base_url: Option<String>,
    /// Consulted only by the entry whose endpoint the user chose (`custom`).
    pub outbound_url_policy: Option<Arc<dyn OutboundUrlPolicy>>,
    pub transport: LlmTransport,
}

pub struct LlmProviderRegistryEntry {
    /// An `llm_provider` constant.
    pub provider: &'static str,
    pub label: &'static str,
    create: fn(LlmProviderCreateParams) -> DomainResult<Arc<dyn LLMProvider>>,
}

impl LlmProviderRegistryEntry {
    pub fn create(&self, params: LlmProviderCreateParams) -> DomainResult<Arc<dyn LLMProvider>> {
        (self.create)(params)
    }
}

fn openai_compatible(
    params: LlmProviderCreateParams,
    api_url: &str,
    default_model: &str,
) -> DomainResult<Arc<dyn LLMProvider>> {
    Ok(Arc::new(OpenAICompatibleLLMProvider::new(
        params.api_key,
        api_url,
        params.model.unwrap_or_else(|| default_model.to_string()),
        None,
        params.transport,
    )))
}

pub static PROVIDER_REGISTRY: [LlmProviderRegistryEntry; 10] = [
    LlmProviderRegistryEntry {
        provider: llm_provider::OPENAI,
        label: "OpenAI",
        create: |params| openai_compatible(params, OPENAI_API_URL, OPENAI_DEFAULT_MODEL),
    },
    LlmProviderRegistryEntry {
        provider: llm_provider::ANTHROPIC,
        label: "Anthropic (Claude)",
        create: |params| {
            Ok(Arc::new(AnthropicLLMProvider::new(params.api_key, params.model, params.transport)))
        },
    },
    LlmProviderRegistryEntry {
        provider: llm_provider::GOOGLEAI,
        label: "Google AI",
        create: |params| {
            Ok(Arc::new(GoogleAILLMProvider::new(params.api_key, params.model, params.transport)))
        },
    },
    LlmProviderRegistryEntry {
        provider: llm_provider::OPENROUTER,
        label: "OpenRouter",
        create: |params| openai_compatible(params, OPENROUTER_API_URL, OPENROUTER_DEFAULT_MODEL),
    },
    LlmProviderRegistryEntry {
        provider: llm_provider::MISTRAL,
        label: "Mistral",
        create: |params| openai_compatible(params, MISTRAL_API_URL, MISTRAL_DEFAULT_MODEL),
    },
    LlmProviderRegistryEntry {
        provider: llm_provider::GROQ,
        label: "Groq",
        create: |params| openai_compatible(params, GROQ_API_URL, GROQ_DEFAULT_MODEL),
    },
    LlmProviderRegistryEntry {
        provider: llm_provider::XAI,
        label: "xAI (Grok)",
        create: |params| openai_compatible(params, XAI_API_URL, XAI_DEFAULT_MODEL),
    },
    LlmProviderRegistryEntry {
        provider: llm_provider::DEEPSEEK,
        label: "DeepSeek",
        create: |params| openai_compatible(params, DEEPSEEK_API_URL, DEEPSEEK_DEFAULT_MODEL),
    },
    LlmProviderRegistryEntry {
        provider: llm_provider::NVIDIA,
        label: "NVIDIA NIM",
        create: |params| openai_compatible(params, NVIDIA_API_URL, NVIDIA_DEFAULT_MODEL),
    },
    LlmProviderRegistryEntry {
        provider: llm_provider::CUSTOM,
        label: "Custom (OpenAI-compatible)",
        create: |params| match (params.base_url, params.model) {
            (Some(base_url), Some(model)) if !base_url.is_empty() && !model.is_empty() => {
                Ok(Arc::new(OpenAICompatibleLLMProvider::new(
                    params.api_key,
                    base_url,
                    model,
                    params.outbound_url_policy,
                    params.transport,
                )))
            }
            _ => Err(DomainError::internal("Custom provider requires both a base URL and a model")),
        },
    },
];

/// The entry for an `llm_provider` value, or `None` for an unknown one.
pub fn provider_registry_entry(provider: &str) -> Option<&'static LlmProviderRegistryEntry> {
    PROVIDER_REGISTRY.iter().find(|entry| entry.provider == provider)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn params(model: Option<&str>, base_url: Option<&str>) -> LlmProviderCreateParams {
        LlmProviderCreateParams {
            api_key: "key".to_string(),
            model: model.map(str::to_string),
            base_url: base_url.map(str::to_string),
            outbound_url_policy: None,
            transport: LlmTransport::new().unwrap(),
        }
    }

    fn custom() -> &'static LlmProviderRegistryEntry {
        provider_registry_entry(llm_provider::CUSTOM).unwrap()
    }

    fn error_text(result: DomainResult<Arc<dyn LLMProvider>>) -> String {
        match result {
            Ok(_) => panic!("expected the entry to refuse"),
            Err(err) => err.to_string(),
        }
    }

    #[test]
    fn has_an_entry_for_every_llm_provider_value() {
        for provider in llm_provider::ALL {
            let entry = provider_registry_entry(provider).expect(provider);
            assert!(!entry.label.is_empty());
        }
        assert_eq!(PROVIDER_REGISTRY.len(), llm_provider::ALL.len());
        assert!(provider_registry_entry("nope").is_none());
    }

    #[test]
    fn every_vendor_entry_creates_a_provider_without_overrides() {
        for provider in llm_provider::ALL.into_iter().filter(|p| *p != llm_provider::CUSTOM) {
            let entry = provider_registry_entry(provider).unwrap();
            assert!(entry.create(params(None, None)).is_ok(), "{provider}");
        }
    }

    #[test]
    fn refuses_the_custom_provider_without_a_base_url() {
        let result = custom().create(params(Some("some-model"), None));
        assert!(error_text(result).contains("Custom provider requires both a base URL and a model"));
    }

    #[test]
    fn refuses_the_custom_provider_without_a_model() {
        let result = custom().create(params(None, Some("https://example.com/v1/chat/completions")));
        assert!(error_text(result).contains("Custom provider requires both a base URL and a model"));
    }

    #[test]
    fn creates_a_provider_for_custom_when_both_are_supplied() {
        let result = custom()
            .create(params(Some("some-model"), Some("https://example.com/v1/chat/completions")));
        assert!(result.is_ok());
    }
}
