//! Turns a provider's non-2xx response into the coded error every AI use
//! case propagates.

use crate::use_cases::errors::{DomainError, LlmProviderErrorKind, LlmProviderFailure};

/// How much of a provider's error body is kept for the log line.
const PROVIDER_ERROR_BODY_MAX_CHARS: usize = 300;

fn kind_for_status(status: u16) -> LlmProviderErrorKind {
    match status {
        401 | 403 => LlmProviderErrorKind::Auth,
        402 => LlmProviderErrorKind::Quota,
        429 => LlmProviderErrorKind::RateLimited,
        status if status >= 500 => LlmProviderErrorKind::Unavailable,
        _ => LlmProviderErrorKind::BadRequest,
    }
}

/// One line of what the provider said: whitespace collapsed and cut at
/// `PROVIDER_ERROR_BODY_MAX_CHARS`. Provider error bodies are short JSON in
/// the normal case, but a custom base URL can answer with anything (a login
/// page, a stack trace, an internal service's whole response) and whatever
/// is kept here ends up in logs. Nothing here is ever sent back to the
/// client verbatim.
pub fn summarize_provider_body(body: &str) -> String {
    let collapsed = body.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.chars().count() > PROVIDER_ERROR_BODY_MAX_CHARS {
        let head: String = collapsed.chars().take(PROVIDER_ERROR_BODY_MAX_CHARS).collect();
        format!("{head}…")
    } else {
        collapsed
    }
}

/// A non-2xx response from a provider, as an `AiProviderError`.
pub fn provider_http_error(label: &str, status: u16, body: &str) -> DomainError {
    let excerpt = summarize_provider_body(body);
    DomainError::llm_provider(
        LlmProviderFailure::new(kind_for_status(status))
            .provider(label)
            .status(status)
            .detail((!excerpt.is_empty()).then_some(excerpt)),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::use_cases::errors::ErrorCode;

    #[test]
    fn classifies_each_status() {
        let cases = [
            (401, LlmProviderErrorKind::Auth),
            (403, LlmProviderErrorKind::Auth),
            (402, LlmProviderErrorKind::Quota),
            (429, LlmProviderErrorKind::RateLimited),
            (400, LlmProviderErrorKind::BadRequest),
            (404, LlmProviderErrorKind::BadRequest),
            (302, LlmProviderErrorKind::BadRequest),
            (500, LlmProviderErrorKind::Unavailable),
            (529, LlmProviderErrorKind::Unavailable),
        ];
        for (status, kind) in cases {
            let err = provider_http_error("Anthropic", status, "{}");
            let failure = err.llm_provider_failure().unwrap();
            assert_eq!(failure.kind, kind, "status {status}");
            assert_eq!(failure.status, Some(status));
            assert_eq!(err.code(), ErrorCode::AiProviderError);
        }
    }

    #[test]
    fn puts_user_facing_copy_plus_the_provider_and_status_in_the_message_and_the_excerpt_in_detail()
    {
        let err = provider_http_error("LLM provider", 401, "{\"error\":\"invalid key\"}");
        assert_eq!(
            err.to_string(),
            "The provider rejected this API key — check it in Settings and try again (LLM provider error 401)"
        );
        assert_eq!(
            err.llm_provider_failure().unwrap().detail.as_deref(),
            Some("{\"error\":\"invalid key\"}")
        );
    }

    #[test]
    fn truncates_a_long_body() {
        let page = format!("<html>{}</html>", "x".repeat(5000));
        let err = provider_http_error("LLM provider", 502, &page);
        let detail = err.llm_provider_failure().unwrap().detail.clone().unwrap();
        assert!(detail.chars().count() < PROVIDER_ERROR_BODY_MAX_CHARS + 2);
        assert!(detail.ends_with('…'));
        assert!(!err.to_string().contains("xxxx"));
    }

    #[test]
    fn records_no_detail_when_the_body_is_empty() {
        let err = provider_http_error("Google AI", 503, "");
        assert_eq!(err.llm_provider_failure().unwrap().detail, None);
        assert!(err.to_string().ends_with("(Google AI error 503)"));
    }

    #[test]
    fn collapses_whitespace_so_a_stack_trace_becomes_one_line() {
        assert_eq!(
            summarize_provider_body("Error:\n   at foo\n\n   at bar"),
            "Error: at foo at bar"
        );
    }
}
