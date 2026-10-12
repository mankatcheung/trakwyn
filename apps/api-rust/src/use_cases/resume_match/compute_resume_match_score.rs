use std::sync::Arc;
use std::time::Duration;

use crate::use_cases::constants::{ai_prompt_input, resume_text_extraction};
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{
    ApplicationRepository, DocumentRepository, DocumentTextExtractor, EducationRepository,
    LLMProviderFactory, LlmCompleteOptions, LlmMessage, RateLimiter, RemoteFile, RemoteFileFetcher,
    SkillRepository, StorageProvider, WorkExperienceRepository,
};
use crate::use_cases::shared::js_string::{js_trim, utf16_prefix};
use crate::use_cases::shared::parse_ai_json::{
    as_object, assert_not_truncated, optional_number, optional_string, optional_string_array,
    parse_ai_json,
};
use crate::use_cases::shared::user_profile::{format_user_profile, load_user_profile};
use crate::use_cases::shared::with_timeout::with_timeout;
use crate::use_cases::shared::wrap_untrusted_content::wrap_untrusted_content;

const RESUME_DOCUMENT_TYPE: &str = "resume";
/// How much of the resume reaches the prompt.
const RESUME_MAX_CHARS: usize = 6000;
const TOO_LARGE_MESSAGE: &str = "The uploaded resume is too large to analyse";

const SYSTEM_PROMPT: &str = "You are an ATS (applicant tracking system) resume screener. Compare a resume against a job description and return ONLY valid JSON with no markdown, no explanation, and no code fences.";

const USER_PROMPT_PREFIX: &str = r#"Compare this resume against the job description below. Return ONLY valid JSON in this exact shape:
{
  "matchPercentage": <number 0-100>,
  "matchedKeywords": ["keyword1", "keyword2", ...],
  "missingKeywords": ["keyword1", "keyword2", ...],
  "summary": "2-3 sentence summary of the fit and the biggest gaps"
}

Job description:
"#;

fn user_prompt(job_description: &str, resume_text: &str) -> String {
    format!(
        "{USER_PROMPT_PREFIX}{}\n\nResume:\n{}",
        wrap_untrusted_content(utf16_prefix(
            job_description,
            ai_prompt_input::RESUME_MATCH_JOB_DESCRIPTION_MAX_CHARS
        )),
        utf16_prefix(resume_text, RESUME_MAX_CHARS)
    )
}

pub struct ComputeResumeMatchScoreInput {
    pub application_id: String,
    pub user_id: String,
    pub resume_text: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResumeMatchScore {
    pub score: i32,
    pub label: String,
    pub matched_keywords: Vec<String>,
    pub missing_keywords: Vec<String>,
    pub summary: String,
}

pub struct ComputeResumeMatchScoreUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub document_repository: Arc<dyn DocumentRepository>,
    pub storage_provider: Arc<dyn StorageProvider>,
    pub remote_file_fetcher: Arc<dyn RemoteFileFetcher>,
    pub document_text_extractor: Arc<dyn DocumentTextExtractor>,
    pub llm_provider_factory: Arc<dyn LLMProviderFactory>,
    pub work_experience_repository: Arc<dyn WorkExperienceRepository>,
    pub education_repository: Arc<dyn EducationRepository>,
    pub skill_repository: Arc<dyn SkillRepository>,
    pub compute_resume_match_score_rate_limiter: Arc<dyn RateLimiter>,
}

fn score_label(score: i32) -> &'static str {
    match score {
        90.. => "Excellent match",
        70.. => "Good match",
        40.. => "Some overlap",
        _ => "Needs work",
    }
}

/// `Math.max(0, Math.min(100, Math.round(percentage)))`. JavaScript rounds a
/// half towards positive infinity, which `f64::round` does not.
fn clamp_score(percentage: f64) -> i32 {
    // The clamp leaves a whole number between 0 and 100.
    (percentage + 0.5).floor().clamp(0.0, 100.0) as i32
}

/// `matchPercentage` is clamped rather than validated. The keyword lists are
/// validated as arrays of strings so a malformed-but-truthy reply (a string,
/// say) cannot pass straight through as if it were valid.
fn parse_response(raw: &str) -> DomainResult<ResumeMatchScore> {
    let value = parse_ai_json(raw)?;
    let object = as_object(&value)?;
    let match_percentage = optional_number(object, "matchPercentage")?;
    let matched_keywords = optional_string_array(object, "matchedKeywords")?;
    let missing_keywords = optional_string_array(object, "missingKeywords")?;
    let summary = optional_string(object, "summary")?;

    let score = clamp_score(match_percentage.unwrap_or(0.0));
    Ok(ResumeMatchScore {
        score,
        label: score_label(score).to_string(),
        matched_keywords: matched_keywords.unwrap_or_default(),
        missing_keywords: missing_keywords.unwrap_or_default(),
        summary: summary.unwrap_or_default(),
    })
}

impl ComputeResumeMatchScoreUseCase {
    pub async fn execute(
        &self,
        input: ComputeResumeMatchScoreInput,
    ) -> DomainResult<ResumeMatchScore> {
        let rate_limit_key = format!("resume-match:user:{}", input.user_id);
        if !self.compute_resume_match_score_rate_limiter.consume(&rate_limit_key).await {
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

        let job_description = app.description.as_deref().map(js_trim).unwrap_or_default();
        if job_description.is_empty() {
            return Err(DomainError::validation(
                "Add a job description to this application before checking resume match",
            ));
        }

        let resume_text = self.resolve_resume_text(&input).await?;

        let result = llm_provider
            .complete(
                &[
                    LlmMessage::system(SYSTEM_PROMPT),
                    LlmMessage::user(user_prompt(job_description, &resume_text)),
                ],
                None,
                LlmCompleteOptions { json: true },
            )
            .await?;
        assert_not_truncated(&result)?;

        parse_response(&result.content)
    }

    /// The pasted text, else the newest uploaded resume, else the profile.
    async fn resolve_resume_text(
        &self,
        input: &ComputeResumeMatchScoreInput,
    ) -> DomainResult<String> {
        let pasted = input.resume_text.as_deref().map(js_trim).unwrap_or_default();
        if !pasted.is_empty() {
            return Ok(pasted.to_string());
        }

        let documents =
            self.document_repository.find_all_by_application_id(&input.application_id).await?;
        let mut resumes: Vec<_> = documents
            .into_iter()
            .filter(|document| document.document_type == RESUME_DOCUMENT_TYPE)
            .collect();
        resumes.sort_by_key(|document| std::cmp::Reverse(document.created_at));

        if let Some(resume_doc) = resumes.into_iter().next() {
            let url = self.storage_provider.get_signed_url(&resume_doc.storage_key, None).await?;
            // The size is checked before the body is read (the header) and
            // after (the header can be absent or wrong): the file is parsed
            // on the request path, and the upload cap is the size the parser
            // was ever meant to see.
            let fetched = self
                .remote_file_fetcher
                .fetch(
                    &url,
                    Duration::from_millis(resume_text_extraction::FETCH_TIMEOUT_MS),
                    resume_text_extraction::MAX_BYTES,
                )
                .await?;
            let bytes = match fetched {
                RemoteFile::NotOk => {
                    return Err(DomainError::service_unavailable(
                        "Failed to read the uploaded resume file",
                    ))
                }
                RemoteFile::TooLarge => return Err(DomainError::validation(TOO_LARGE_MESSAGE)),
                RemoteFile::Body(bytes) => bytes,
            };
            if bytes.len() > resume_text_extraction::MAX_BYTES {
                return Err(DomainError::validation(TOO_LARGE_MESSAGE));
            }
            let text = with_timeout(
                self.document_text_extractor.extract(bytes, &resume_doc.mime_type),
                resume_text_extraction::EXTRACT_TIMEOUT_MS,
                || DomainError::service_unavailable("Reading the uploaded resume took too long"),
            )
            .await?;

            if !js_trim(&text).is_empty() {
                return Ok(text);
            }
        }

        let profile = format_user_profile(
            &load_user_profile(
                &self.work_experience_repository,
                &self.education_repository,
                &self.skill_repository,
                &input.user_id,
            )
            .await?,
        );
        if !profile.is_empty() {
            return Ok(profile);
        }

        Err(DomainError::validation(
            "Upload a resume, paste your resume text, or add work experience and skills to your profile",
        ))
    }
}

#[cfg(test)]
mod unit {
    use super::*;

    #[test]
    fn rounds_a_half_up_as_javascript_does_and_clamps() {
        assert_eq!(clamp_score(72.5), 73);
        assert_eq!(clamp_score(72.49), 72);
        assert_eq!(clamp_score(-0.5), 0);
        assert_eq!(clamp_score(-40.0), 0);
        assert_eq!(clamp_score(250.0), 100);
        assert_eq!(clamp_score(99.5), 100);
    }

    #[test]
    fn labels_each_band() {
        assert_eq!(score_label(100), "Excellent match");
        assert_eq!(score_label(90), "Excellent match");
        assert_eq!(score_label(89), "Good match");
        assert_eq!(score_label(70), "Good match");
        assert_eq!(score_label(69), "Some overlap");
        assert_eq!(score_label(40), "Some overlap");
        assert_eq!(score_label(39), "Needs work");
        assert_eq!(score_label(0), "Needs work");
    }
}
