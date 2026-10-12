use std::sync::Arc;

use crate::domain::application::Application;
use crate::use_cases::constants::ai_prompt_input;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{
    ApplicationRepository, CompanyBriefingRepository, DocumentDraftRepository, EducationRepository,
    LLMProviderFactory, LlmCompleteOptions, LlmMessage, NoteRepository, RateLimiter,
    SkillRepository, UserRepository, WorkExperienceRepository,
};
use crate::use_cases::shared::application_context::{
    format_application_context, ApplicationContext,
};
use crate::use_cases::shared::cross_application_context::format_cross_application_context;
use crate::use_cases::shared::js_string::{js_trim, utf16_prefix};
use crate::use_cases::shared::user_profile::{format_user_profile, load_user_profile};
use crate::use_cases::shared::wrap_untrusted_content::wrap_untrusted_content;

const SYSTEM_PROMPT: &str = "You are a professional cover letter writer. Write compelling, personalized cover letters that are concise (3-4 paragraphs), specific to the role, and written in first person. Return ONLY the cover letter body — no subject line, no date, no address block, no explanation.";
const MAX_TOKENS: u32 = 1024;
/// How much of the pasted resume, or of the stored profile, reaches the prompt.
const BACKGROUND_MAX_CHARS: usize = 4000;

pub struct GenerateCoverLetterInput {
    pub application_id: String,
    pub user_id: String,
    pub resume_text: Option<String>,
}

pub struct GenerateCoverLetterUseCase {
    pub llm_provider_factory: Arc<dyn LLMProviderFactory>,
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub work_experience_repository: Arc<dyn WorkExperienceRepository>,
    pub education_repository: Arc<dyn EducationRepository>,
    pub skill_repository: Arc<dyn SkillRepository>,
    pub user_repository: Arc<dyn UserRepository>,
    pub generate_cover_letter_rate_limiter: Arc<dyn RateLimiter>,
    pub note_repository: Arc<dyn NoteRepository>,
    pub document_draft_repository: Arc<dyn DocumentDraftRepository>,
    pub company_briefing_repository: Arc<dyn CompanyBriefingRepository>,
}

impl GenerateCoverLetterUseCase {
    pub async fn execute(&self, input: GenerateCoverLetterInput) -> DomainResult<String> {
        let rate_limit_key = format!("cover-letter:user:{}", input.user_id);
        if !self.generate_cover_letter_rate_limiter.consume(&rate_limit_key).await {
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

        // Notes and the briefing are both optional. Having neither is the
        // normal state, and generation works the same when they are absent.
        let profile = format_user_profile(
            &load_user_profile(
                &self.work_experience_repository,
                &self.education_repository,
                &self.skill_repository,
                &input.user_id,
            )
            .await?,
        );
        let user = self.user_repository.find_by_id(&input.user_id).await?;
        let notes = self.note_repository.find_all_by_application_id(&input.application_id).await?;
        let briefing =
            self.company_briefing_repository.find_by_application_id(&input.application_id).await?;
        let context = format_application_context(&ApplicationContext {
            notes: &notes,
            briefing: briefing.as_ref(),
        });

        // Only fetched when the user opted in (JEF-249): an extra pair of
        // queries across every generation otherwise, for a feature most
        // users have not turned on.
        let mut cross_application_context = String::new();
        if user.as_ref().is_some_and(|user| user.use_cross_application_context) {
            let limit = ai_prompt_input::CROSS_APPLICATION_CONTEXT_MAX_APPLICATIONS as i64;
            let other_notes = self
                .note_repository
                .find_recent_by_user_excluding_application(
                    &input.user_id,
                    &input.application_id,
                    limit,
                )
                .await?;
            let other_cover_letters = self
                .document_draft_repository
                .find_recent_cover_letters_by_user_excluding_application(
                    &input.user_id,
                    &input.application_id,
                    limit,
                )
                .await?;
            cross_application_context =
                format_cross_application_context(&other_notes, &other_cover_letters);
        }

        let user_prompt = build_prompt(
            &app,
            &profile,
            input.resume_text.as_deref(),
            &context,
            &cross_application_context,
        );

        let mut messages = vec![LlmMessage::system(SYSTEM_PROMPT)];
        if let Some(custom_ai_prompt) = user
            .and_then(|user| user.custom_ai_prompt)
            .filter(|custom_ai_prompt| !custom_ai_prompt.is_empty())
        {
            messages.push(LlmMessage::system(custom_ai_prompt));
        }
        messages.push(LlmMessage::user(user_prompt));

        let result = llm_provider
            .complete(&messages, Some(MAX_TOKENS), LlmCompleteOptions::default())
            .await?;
        Ok(result.content)
    }
}

fn build_prompt(
    app: &Application,
    profile: &str,
    resume_text: Option<&str>,
    application_context: &str,
    cross_application_context: &str,
) -> String {
    let mut lines = vec![
        "Write a cover letter for this job application:".to_string(),
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
                ai_prompt_input::COVER_LETTER_JOB_DESCRIPTION_MAX_CHARS
            ))
        ));
    }

    if !application_context.is_empty() {
        lines.push(format!("\n{application_context}"));
    }

    if !cross_application_context.is_empty() {
        lines.push(format!("\n{cross_application_context}"));
    }

    let resume_text = resume_text.map(js_trim).filter(|text| !text.is_empty());
    if let Some(resume_text) = resume_text {
        lines.push(format!(
            "\nMy background / resume:\n{}",
            utf16_prefix(resume_text, BACKGROUND_MAX_CHARS)
        ));
    } else if !profile.is_empty() {
        lines.push(format!("\nMy background:\n{}", utf16_prefix(profile, BACKGROUND_MAX_CHARS)));
    } else {
        lines.push(
            "\nWrite a strong general cover letter for someone applying to this role.".to_string(),
        );
    }

    lines.join("\n")
}
