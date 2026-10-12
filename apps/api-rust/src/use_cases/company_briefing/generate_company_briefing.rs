use std::sync::Arc;

use crate::domain::application::Application;
use crate::domain::company_briefing::CompanyBriefing;
use crate::use_cases::constants::ai_prompt_input;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{
    ApplicationRepository, CompanyBriefingRepository, LLMProviderFactory, LlmCompleteOptions,
    LlmMessage, RateLimiter, UpsertCompanyBriefingData, UserRepository,
};
use crate::use_cases::shared::js_string::utf16_prefix;
use crate::use_cases::shared::token_limit::Now;
use crate::use_cases::shared::wrap_untrusted_content::wrap_untrusted_content;

const SYSTEM_PROMPT: &str = r#"You are a career research assistant preparing a candidate for a job application. Given a company, role, and job description, write a concise pre-interview briefing covering:

1. Company overview — what the company does, in a sentence or two.
2. Culture signals — what's likely true about how this company operates, based on its industry, size, and the tone of the job description.
3. Likely interview style — what kind of interview process a company like this typically runs (e.g. take-home vs. live coding, panel vs. 1:1, how many rounds).
4. Talking points — 3-5 specific things the candidate could bring up to show genuine interest and preparation.

Do NOT include a "recent news" section or reference specific current events, funding rounds, layoffs, leadership changes, or anything time-sensitive — you have no reliable access to real-time information, and presenting stale or fabricated "recent" facts as current would be actively misleading. If you don't have confident general knowledge of the company, say so plainly rather than guessing specifics.

Return plain text with short section headers, no markdown formatting."#;
const MAX_TOKENS: u32 = 768;

pub struct GenerateCompanyBriefingInput {
    pub application_id: String,
    pub user_id: String,
}

pub struct GenerateCompanyBriefingUseCase {
    pub llm_provider_factory: Arc<dyn LLMProviderFactory>,
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub user_repository: Arc<dyn UserRepository>,
    pub generate_company_briefing_rate_limiter: Arc<dyn RateLimiter>,
    pub company_briefing_repository: Arc<dyn CompanyBriefingRepository>,
    pub generate_id: GenerateId,
    pub now: Now,
}

impl GenerateCompanyBriefingUseCase {
    pub async fn execute(
        &self,
        input: GenerateCompanyBriefingInput,
    ) -> DomainResult<CompanyBriefing> {
        let rate_limit_key = format!("company-briefing:user:{}", input.user_id);
        if !self.generate_company_briefing_rate_limiter.consume(&rate_limit_key).await {
            return Err(DomainError::rate_limited(
                "Too many requests — please wait a moment and try again",
            ));
        }

        let app = self
            .application_repository
            .find_by_id(&input.application_id)
            .await?
            .ok_or_else(|| DomainError::not_found("Application not found"))?;
        if app.user_id != input.user_id {
            return Err(DomainError::forbidden("Forbidden"));
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

        let user = self.user_repository.find_by_id(&input.user_id).await?;

        let mut messages = vec![LlmMessage::system(SYSTEM_PROMPT)];
        if let Some(custom_ai_prompt) = user
            .and_then(|user| user.custom_ai_prompt)
            .filter(|custom_ai_prompt| !custom_ai_prompt.is_empty())
        {
            messages.push(LlmMessage::system(custom_ai_prompt));
        }
        messages.push(LlmMessage::user(build_prompt(&app)));

        let result = llm_provider
            .complete(&messages, Some(MAX_TOKENS), LlmCompleteOptions::default())
            .await?;

        // Persisted rather than returned and forgotten (JEF-195). Upsert,
        // not insert: one briefing per application, and regenerating
        // replaces it. Only reached on success, so a failed call leaves the
        // previous briefing intact rather than blanking it.
        self.company_briefing_repository
            .upsert(UpsertCompanyBriefingData {
                id: (self.generate_id)(),
                application_id: input.application_id,
                content: result.content,
                generated_at: (self.now)(),
            })
            .await
    }
}

fn build_prompt(app: &Application) -> String {
    let mut lines = vec![
        "Prepare a briefing for this application:".to_string(),
        format!("Company: {}", app.company),
        format!("Role: {}", app.role),
    ];
    if let Some(location) = app.location.as_deref().filter(|location| !location.is_empty()) {
        lines.push(format!("Location: {location}"));
    }
    if let Some(description) = app.description.as_deref().filter(|text| !text.is_empty()) {
        lines.push(format!(
            "\nJob description:\n{}",
            wrap_untrusted_content(utf16_prefix(
                description,
                ai_prompt_input::COMPANY_BRIEFING_JOB_DESCRIPTION_MAX_CHARS
            ))
        ));
    }
    lines.join("\n")
}
