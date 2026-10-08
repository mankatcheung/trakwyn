use std::collections::HashSet;
use std::sync::Arc;

use serde_json::{Map, Value};

use crate::domain::application::Application;
use crate::domain::resume::{
    ResumeContent, ResumeEducationEntry, ResumeExperienceEntry, ResumeSkillGroup,
};
use crate::use_cases::constants::ai_prompt_input;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{
    ApplicationRepository, DocumentDraftRepository, EducationRepository, LLMProviderFactory,
    LlmCompleteOptions, LlmMessage, NoteRepository, RateLimiter, SkillRepository, UserRepository,
    WorkExperienceRepository,
};
use crate::use_cases::shared::application_context::{
    format_application_context, ApplicationContext,
};
use crate::use_cases::shared::cross_application_context::format_cross_application_context;
use crate::use_cases::shared::js_string::{js_trim, utf16_prefix};
use crate::use_cases::shared::parse_ai_json::{
    as_object, assert_not_truncated, optional_string, parse_ai_json, required_object_array,
    required_string, required_string_array,
};
use crate::use_cases::shared::user_profile::{
    format_user_profile, is_user_profile_empty, load_user_profile, UserProfile,
};
use crate::use_cases::shared::wrap_untrusted_content::wrap_untrusted_content;

const SYSTEM_PROMPT: &str = r#"You are a resume writer. You will be given a candidate's real work experience, education and skills, and a job they are applying for.

Your job is to SELECT, ORDER and REWORD what you are given so it reads well for this specific role. You are tailoring, not authoring.

Absolute rules:
- Never invent an employer, job title, institution, qualification, date, skill or achievement. Every company and institution you name must be one that appears in the candidate's background below.
- Never inflate seniority or exaggerate scope. If the background is thin, produce a short resume.
- Prefer the candidate's own wording where it is already clear.
- Write bullets as concrete accomplishments drawn from the descriptions provided. If a role has no description, write no bullets for it rather than imagining them.

Return ONLY minified JSON of this shape, with no markdown fence and no commentary:
{"summary":string,"experience":[{"company":string,"title":string,"period":string,"bullets":[string]}],"education":[{"institution":string,"qualification":string,"period":string}],"skills":[{"category":string,"items":[string]}]}"#;
const MAX_TOKENS: u32 = 2048;

pub struct GenerateResumeInput {
    pub application_id: String,
    pub user_id: String,
}

pub struct GenerateResumeUseCase {
    pub llm_provider_factory: Arc<dyn LLMProviderFactory>,
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub work_experience_repository: Arc<dyn WorkExperienceRepository>,
    pub education_repository: Arc<dyn EducationRepository>,
    pub skill_repository: Arc<dyn SkillRepository>,
    pub user_repository: Arc<dyn UserRepository>,
    pub generate_resume_rate_limiter: Arc<dyn RateLimiter>,
    pub note_repository: Arc<dyn NoteRepository>,
    pub document_draft_repository: Arc<dyn DocumentDraftRepository>,
}

fn experience_entry(entry: &Map<String, Value>) -> DomainResult<ResumeExperienceEntry> {
    Ok(ResumeExperienceEntry {
        company: required_string(entry, "company")?,
        title: required_string(entry, "title")?,
        period: optional_string(entry, "period")?,
        bullets: required_string_array(entry, "bullets")?,
    })
}

fn education_entry(entry: &Map<String, Value>) -> DomainResult<ResumeEducationEntry> {
    Ok(ResumeEducationEntry {
        institution: required_string(entry, "institution")?,
        qualification: optional_string(entry, "qualification")?,
        period: optional_string(entry, "period")?,
    })
}

fn skill_group(entry: &Map<String, Value>) -> DomainResult<ResumeSkillGroup> {
    Ok(ResumeSkillGroup {
        category: required_string(entry, "category")?,
        items: required_string_array(entry, "items")?,
    })
}

/// The reply as a resume, or `AI_RESPONSE_INVALID` when it is not shaped
/// like one.
fn parse_resume(raw: &str) -> DomainResult<ResumeContent> {
    let value = parse_ai_json(raw)?;
    let object = as_object(&value)?;
    Ok(ResumeContent {
        summary: optional_string(object, "summary")?,
        experience: required_object_array(object, "experience", experience_entry)?,
        education: required_object_array(object, "education", education_entry)?,
        skills: required_object_array(object, "skills", skill_group)?,
    })
}

/// Compared loosely: rewording is allowed, inventing is not.
fn normalize(value: &str) -> String {
    js_trim(value).to_lowercase()
}

/// Every employer and institution in the output must be one the user
/// entered.
///
/// A resume asserts facts about someone's history. A model that adds a job
/// is not producing a worse draft, it is producing a document that is
/// harmful to send, so this refuses rather than filtering the invented
/// entries out, which would hand back a plausible resume with no sign
/// anything had gone wrong.
fn assert_grounded(resume: &ResumeContent, profile: &UserProfile) -> DomainResult<()> {
    let companies: HashSet<String> =
        profile.work_experiences.iter().map(|role| normalize(&role.company)).collect();
    let institutions: HashSet<String> =
        profile.educations.iter().map(|entry| normalize(&entry.institution)).collect();

    let invented_employer =
        resume.experience.iter().any(|entry| !companies.contains(&normalize(&entry.company)));
    let invented_school =
        resume.education.iter().any(|entry| !institutions.contains(&normalize(&entry.institution)));

    if invented_employer || invented_school {
        return Err(DomainError::ai_response_invalid(
            "The AI produced a resume containing experience you have not recorded — nothing was saved. Please try again.",
        ));
    }
    Ok(())
}

impl GenerateResumeUseCase {
    pub async fn execute(&self, input: GenerateResumeInput) -> DomainResult<ResumeContent> {
        let rate_limit_key = format!("resume:user:{}", input.user_id);
        if !self.generate_resume_rate_limiter.consume(&rate_limit_key).await {
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

        let profile = load_user_profile(
            &self.work_experience_repository,
            &self.education_repository,
            &self.skill_repository,
            &input.user_id,
        )
        .await?;
        if is_user_profile_empty(&profile) {
            // Nothing truthful to build from. Asking the model anyway is an
            // invitation to invent an entire history.
            return Err(DomainError::validation(
                "Add your work experience, education or skills in Settings before generating a resume",
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

        let user = self.user_repository.find_by_id(&input.user_id).await?;
        let notes = self.note_repository.find_all_by_application_id(&input.application_id).await?;
        // Notes only, no company briefing: a resume is about the candidate,
        // and the briefing is unverified model output about the employer.
        // Nothing in it belongs in a document asserting this person's
        // history (JEF-205).
        let context =
            format_application_context(&ApplicationContext { notes: &notes, briefing: None });

        // Only fetched when the user opted in (JEF-249). Voice and phrasing
        // only: `assert_grounded` below is what actually stops an employer
        // or institution named in this context from ending up asserted as
        // fact.
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

        let mut messages = vec![LlmMessage::system(SYSTEM_PROMPT)];
        if let Some(custom_ai_prompt) = user
            .and_then(|user| user.custom_ai_prompt)
            .filter(|custom_ai_prompt| !custom_ai_prompt.is_empty())
        {
            messages.push(LlmMessage::system(custom_ai_prompt));
        }
        messages.push(LlmMessage::user(build_prompt(
            &app,
            &profile,
            &context,
            &cross_application_context,
        )));

        let result = llm_provider
            .complete(&messages, Some(MAX_TOKENS), LlmCompleteOptions { json: true })
            .await?;
        assert_not_truncated(&result)?;
        let resume = parse_resume(&result.content)?;
        assert_grounded(&resume, &profile)?;
        Ok(resume)
    }
}

fn build_prompt(
    app: &Application,
    profile: &UserProfile,
    application_context: &str,
    cross_application_context: &str,
) -> String {
    let mut lines = vec![
        "Tailor this candidate to the following role.".to_string(),
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
    lines.push(format!(
        "\nCandidate background — the only facts you may use:\n{}",
        format_user_profile(profile)
    ));
    lines.join("\n")
}
