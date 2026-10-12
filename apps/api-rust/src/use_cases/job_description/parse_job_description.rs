use std::sync::Arc;

use crate::use_cases::constants::ai_prompt_input;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{
    JobPostingSource, JobPostingSourceResolver, LLMProviderFactory, LlmCompleteOptions, LlmMessage,
    RateLimiter,
};
use crate::use_cases::shared::js_string::{js_trim, utf16_prefix};
use crate::use_cases::shared::parse_ai_json::{
    as_object, assert_not_truncated, nullable_string, parse_ai_json,
};
use crate::use_cases::shared::wrap_untrusted_content::wrap_untrusted_content;

const SYSTEM_PROMPT: &str = "You are a job posting parser. Extract structured data from job postings and return ONLY valid JSON with no markdown, no explanation, and no code fences. If a field cannot be determined, use null.";

const USER_PROMPT_PREFIX: &str = r#"Extract the following from this job posting and return ONLY valid JSON:
{
  "company": "company name or null",
  "role": "job title or null",
  "location": "location (city, remote, hybrid, etc.) or null",
  "salary": "salary range or null",
  "description": "2-3 sentence summary of the role and key requirements, or null"
}

Job posting:
"#;

fn user_prompt(text: &str) -> String {
    format!(
        "{USER_PROMPT_PREFIX}{}",
        wrap_untrusted_content(utf16_prefix(text, ai_prompt_input::JOB_POSTING_MAX_CHARS))
    )
}

pub struct ParseJobDescriptionInput {
    pub user_id: String,
    pub text: Option<String>,
    pub url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ParsedJobDescription {
    pub company: Option<String>,
    pub role: Option<String>,
    pub location: Option<String>,
    pub salary: Option<String>,
    pub description: Option<String>,
}

pub struct ParseJobDescriptionUseCase {
    pub llm_provider_factory: Arc<dyn LLMProviderFactory>,
    pub job_posting_source_resolver: Arc<dyn JobPostingSourceResolver>,
    pub parse_job_description_rate_limiter: Arc<dyn RateLimiter>,
}

/// A field the model omits and one it explicitly sends as null mean the same
/// thing here ("couldn't determine this"). A field present with the wrong
/// type (a number where a string is expected) fails validation instead of
/// silently passing through.
fn parse_response(raw: &str) -> DomainResult<ParsedJobDescription> {
    let value = parse_ai_json(raw)?;
    let object = as_object(&value)?;
    Ok(ParsedJobDescription {
        company: nullable_string(object, "company")?,
        role: nullable_string(object, "role")?,
        location: nullable_string(object, "location")?,
        salary: nullable_string(object, "salary")?,
        description: nullable_string(object, "description")?,
    })
}

impl ParseJobDescriptionUseCase {
    pub async fn execute(
        &self,
        input: ParseJobDescriptionInput,
    ) -> DomainResult<ParsedJobDescription> {
        let rate_limit_key = format!("parse-job-description:user:{}", input.user_id);
        if !self.parse_job_description_rate_limiter.consume(&rate_limit_key).await {
            return Err(DomainError::rate_limited(
                "Too many requests — please wait a moment and try again",
            ));
        }

        let llm_provider = self
            .llm_provider_factory
            .for_user(&input.user_id, None, None, true)
            .await?
            .ok_or_else(|| {
                DomainError::ai_not_configured(
                    "Add your AI API key in Settings to use this feature",
                )
            })?;

        let text = self
            .job_posting_source_resolver
            .resolve(JobPostingSource { text: input.text, url: input.url })
            .await?;
        if js_trim(&text).is_empty() {
            return Err(DomainError::validation("No job description content provided"));
        }

        let result = llm_provider
            .complete(
                &[LlmMessage::system(SYSTEM_PROMPT), LlmMessage::user(user_prompt(&text))],
                None,
                LlmCompleteOptions { json: true },
            )
            .await?;
        assert_not_truncated(&result)?;

        parse_response(&result.content)
    }
}
