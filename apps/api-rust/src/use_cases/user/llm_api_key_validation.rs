//! Shape checks for LLM settings. Only the model-id rule is ported so far
//! (conversations need it); the provider and key-shape checks of
//! `llmApiKeyValidation.ts` arrive with the LLM-key use cases.

use crate::use_cases::errors::{DomainError, DomainResult};

/// The longest model id accepted.
const MODEL_ID_MAX_LENGTH: usize = 128;

/// What a model id may look like. Real ids are things like `gpt-4o-mini`,
/// `claude-haiku-4-5`, `openai/gpt-4o-mini` (OpenRouter), `models/gemini-…`.
/// The Google provider interpolates the id into a URL path, so anything that
/// could climb or re-target it (`..`, `?`, `#`, whitespace, a scheme) is
/// refused here, where every model id enters the system.
///
/// `apps/api` states the shape as `/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/`.
fn matches_model_id_pattern(model: &str) -> bool {
    let bytes = model.as_bytes();
    let Some((first, rest)) = bytes.split_first() else {
        return false;
    };
    bytes.len() <= MODEL_ID_MAX_LENGTH
        && first.is_ascii_alphanumeric()
        && rest.iter().all(|byte| {
            byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b':' | b'/' | b'-')
        })
}

pub fn assert_valid_llm_model_id(model: &str) -> DomainResult<()> {
    if !matches_model_id_pattern(model) || model.contains("..") || model.contains("//") {
        return Err(DomainError::validation("Model name contains characters that are not allowed"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::use_cases::errors::ErrorCode;

    #[test]
    fn accepts_the_ids_real_providers_use() {
        for model in [
            "gpt-4o-mini",
            "claude-haiku-4-5",
            "openai/gpt-4o-mini",
            "models/gemini-1.5-flash",
            "meta/llama-3.1:free",
            "a",
            &"a".repeat(128),
        ] {
            assert!(assert_valid_llm_model_id(model).is_ok(), "{model}");
        }
    }

    #[test]
    fn refuses_anything_that_could_retarget_a_url() {
        for model in [
            "",
            "../admin",
            "a..b",
            "a//b",
            "https://evil.example",
            "model?key=1",
            "model#frag",
            "has space",
            "-leading-dash",
            "/leading-slash",
            "trailing\n",
            "ünicode",
            &"a".repeat(129),
        ] {
            let err = assert_valid_llm_model_id(model).unwrap_err();
            assert_eq!(err.code(), ErrorCode::Validation, "{model}");
            assert_eq!(err.to_string(), "Model name contains characters that are not allowed");
        }
    }
}
