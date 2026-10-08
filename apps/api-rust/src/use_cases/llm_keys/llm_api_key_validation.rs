use crate::use_cases::constants::llm_provider;
use crate::use_cases::errors::{DomainError, DomainResult};

/// Longest model id accepted, first character included.
const MODEL_ID_MAX_CHARS: usize = 128;

pub fn assert_valid_llm_provider(provider: &str) -> DomainResult<()> {
    if !llm_provider::ALL.contains(&provider) {
        return Err(DomainError::validation("Unsupported AI provider"));
    }
    Ok(())
}

/// `^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$`.
fn matches_model_id_pattern(model: &str) -> bool {
    let mut characters = model.chars();
    let Some(first) = characters.next() else { return false };
    first.is_ascii_alphanumeric()
        && model.len() <= MODEL_ID_MAX_CHARS
        && characters.all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | ':' | '/' | '-'))
}

/// What a model id may look like. Real ids are things like `gpt-4o-mini`,
/// `claude-haiku-4-5`, `openai/gpt-4o-mini` (OpenRouter), `models/gemini-…`.
/// The Google provider interpolates the id into a URL path, so anything that
/// could climb or re-target it (`..`, `?`, `#`, whitespace, a scheme) is
/// refused here, where every model id enters the system.
pub fn assert_valid_llm_model_id(model: &str) -> DomainResult<()> {
    if !matches_model_id_pattern(model) || model.contains("..") || model.contains("//") {
        return Err(DomainError::validation("Model name contains characters that are not allowed"));
    }
    Ok(())
}

pub fn is_valid_llm_api_key_url(value: &str) -> bool {
    url::Url::parse(value).is_ok_and(|url| matches!(url.scheme(), "http" | "https"))
}

/// Shared by saving and testing a key (JEF-247): both need the same "is this
/// a real provider, and does it carry a base URL and model the way its
/// provider type requires" check before doing anything with the key itself.
/// `base_url` and `model` are already trimmed, with blank meaning `None`.
pub fn assert_valid_llm_api_key_shape(
    provider: &str,
    base_url: Option<&str>,
    model: Option<&str>,
) -> DomainResult<()> {
    assert_valid_llm_provider(provider)?;
    if let Some(model) = model {
        assert_valid_llm_model_id(model)?;
    }

    if provider == llm_provider::CUSTOM {
        let Some(base_url) = base_url else {
            return Err(DomainError::validation("A base URL is required for a custom provider"));
        };
        if !is_valid_llm_api_key_url(base_url) {
            return Err(DomainError::validation("Base URL must be a valid http(s) URL"));
        }
        if model.is_none() {
            return Err(DomainError::validation("A model is required for a custom provider"));
        }
    } else if base_url.is_some() {
        return Err(DomainError::validation("A base URL can only be set for a custom provider"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::use_cases::errors::ErrorCode;

    fn message(result: DomainResult<()>) -> String {
        let err = result.unwrap_err();
        assert_eq!(err.code(), ErrorCode::Validation);
        err.to_string()
    }

    #[test]
    fn accepts_every_known_provider_and_refuses_the_rest() {
        for provider in llm_provider::ALL {
            assert!(assert_valid_llm_provider(provider).is_ok());
        }
        assert_eq!(message(assert_valid_llm_provider("skynet")), "Unsupported AI provider");
        assert_eq!(message(assert_valid_llm_provider("")), "Unsupported AI provider");
        assert_eq!(message(assert_valid_llm_provider("OpenAI")), "Unsupported AI provider");
    }

    #[test]
    fn accepts_the_model_ids_providers_actually_use() {
        for model in [
            "gpt-4o-mini",
            "claude-haiku-4-5",
            "openai/gpt-4o-mini",
            "models/gemini-2.0-flash",
            "meta/llama-3.1-8b-instruct",
            "llama3.2:latest",
            "a",
        ] {
            assert!(assert_valid_llm_model_id(model).is_ok(), "{model}");
        }
        assert!(assert_valid_llm_model_id(&"a".repeat(128)).is_ok());
    }

    #[test]
    fn refuses_a_model_id_with_path_or_query_characters() {
        for model in [
            "../../v1/models",
            "gpt-4o?key=1",
            "gpt-4o#frag",
            "gpt 4o",
            "https://evil.example/model",
            "a//b",
            "-leading-dash",
            "/leading-slash",
            "gpt-4o\n",
            "modèle",
            "",
        ] {
            assert_eq!(
                message(assert_valid_llm_model_id(model)),
                "Model name contains characters that are not allowed",
                "{model:?}"
            );
        }
        assert!(assert_valid_llm_model_id(&"a".repeat(129)).is_err());
    }

    #[test]
    fn a_base_url_must_be_http_or_https() {
        assert!(is_valid_llm_api_key_url("https://llm.example.com/v1/chat/completions"));
        assert!(is_valid_llm_api_key_url("http://localhost:11434/v1/chat/completions"));
        assert!(!is_valid_llm_api_key_url("ftp://llm.example.com"));
        assert!(!is_valid_llm_api_key_url("file:///etc/passwd"));
        assert!(!is_valid_llm_api_key_url("not a url"));
        assert!(!is_valid_llm_api_key_url("llm.example.com/v1"));
    }

    #[test]
    fn a_custom_provider_needs_a_valid_base_url_and_a_model() {
        assert_eq!(
            message(assert_valid_llm_api_key_shape("custom", None, Some("m"))),
            "A base URL is required for a custom provider"
        );
        assert_eq!(
            message(assert_valid_llm_api_key_shape("custom", Some("nope"), Some("m"))),
            "Base URL must be a valid http(s) URL"
        );
        assert_eq!(
            message(assert_valid_llm_api_key_shape("custom", Some("https://x.example/v1"), None)),
            "A model is required for a custom provider"
        );
        assert!(assert_valid_llm_api_key_shape("custom", Some("https://x.example/v1"), Some("m"))
            .is_ok());
    }

    #[test]
    fn a_named_provider_takes_an_optional_model_and_no_base_url() {
        assert!(assert_valid_llm_api_key_shape("openai", None, None).is_ok());
        assert!(assert_valid_llm_api_key_shape("openai", None, Some("gpt-4o-mini")).is_ok());
        assert_eq!(
            message(assert_valid_llm_api_key_shape("openai", Some("https://x.example"), None)),
            "A base URL can only be set for a custom provider"
        );
    }

    #[test]
    fn the_provider_is_checked_before_the_model() {
        assert_eq!(
            message(assert_valid_llm_api_key_shape("skynet", None, Some("../x"))),
            "Unsupported AI provider"
        );
        assert_eq!(
            message(assert_valid_llm_api_key_shape("custom", None, Some("../x"))),
            "Model name contains characters that are not allowed"
        );
    }
}
