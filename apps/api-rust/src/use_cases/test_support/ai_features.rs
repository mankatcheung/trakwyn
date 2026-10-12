//! One world of fakes for the single-shot AI feature tests: an owner with an
//! application, a scripted model, and every repository those use cases read.

use std::sync::Arc;

use chrono::{DateTime, Utc};

use super::{
    application_owned_by, user_with_email, FakeApplicationRepository,
    FakeCompanyBriefingRepository, FakeDocumentDraftRepository, FakeDocumentRepository,
    FakeDocumentTextExtractor, FakeEducationRepository, FakeLLMProvider, FakeLLMProviderFactory,
    FakeLlmCall, FakeNoteRepository, FakeRemoteFileFetcher, FakeSkillRepository,
    FakeStorageProvider, FakeUserRepository, FakeWorkExperienceRepository, FixedRateLimiter,
};
use crate::domain::application::Application;
use crate::domain::company_briefing::CompanyBriefing;
use crate::domain::document::Document;
use crate::domain::document_draft::{DocumentDraft, DocumentDraftType};
use crate::domain::education::Education;
use crate::domain::note::Note;
use crate::domain::skill::Skill;
use crate::domain::user::User;
use crate::domain::work_experience::WorkExperience;
use crate::use_cases::ports::LlmMessage;
use crate::use_cases::shared::token_limit::Now;

pub const AI_OWNER: &str = "user-owner";
pub const AI_STRANGER: &str = "user-stranger";
pub const AI_APPLICATION: &str = "app-1";
pub const AI_OTHER_APPLICATION: &str = "app-other";

pub fn ai_instant(text: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(text).unwrap().with_timezone(&Utc)
}

/// The clock every AI feature test reads: noon on 9 March 2026, UTC.
pub fn ai_now() -> Now {
    Arc::new(|| ai_instant("2026-03-09T12:00:00Z"))
}

pub fn ai_note(id: &str, application_id: &str, content: &str) -> Note {
    let epoch = DateTime::<Utc>::UNIX_EPOCH;
    Note {
        id: id.to_string(),
        application_id: application_id.to_string(),
        content: content.to_string(),
        created_at: epoch,
        updated_at: epoch,
    }
}

pub fn ai_cover_letter(id: &str, application_id: &str, plain_text: &str) -> DocumentDraft {
    let epoch = DateTime::<Utc>::UNIX_EPOCH;
    DocumentDraft {
        id: id.to_string(),
        application_id: application_id.to_string(),
        draft_type: DocumentDraftType::CoverLetter,
        title: "Globex — Staff Engineer".to_string(),
        content_json: "{}".to_string(),
        plain_text: plain_text.to_string(),
        source_document_id: None,
        created_at: epoch,
        updated_at: epoch,
    }
}

pub fn ai_role(company: &str, title: &str, description: Option<&str>) -> WorkExperience {
    let start = ai_instant("2020-01-15T00:00:00Z");
    WorkExperience {
        id: format!("we-{company}"),
        user_id: AI_OWNER.to_string(),
        company: company.to_string(),
        title: title.to_string(),
        location: None,
        start_date: start,
        end_date: None,
        description: description.map(str::to_string),
        created_at: start,
        updated_at: start,
    }
}

pub fn ai_education(institution: &str) -> Education {
    let start = ai_instant("2012-09-01T00:00:00Z");
    Education {
        id: format!("ed-{institution}"),
        user_id: AI_OWNER.to_string(),
        institution: institution.to_string(),
        degree: Some("BSc".to_string()),
        field: Some("Computer Science".to_string()),
        start_date: start,
        end_date: Some(ai_instant("2016-06-30T00:00:00Z")),
        description: None,
        created_at: start,
        updated_at: start,
    }
}

pub fn ai_skill(name: &str, category: Option<&str>) -> Skill {
    Skill {
        id: format!("sk-{name}"),
        user_id: AI_OWNER.to_string(),
        name: name.to_string(),
        category: category.map(str::to_string),
        proficiency: None,
        created_at: ai_instant("2020-01-15T00:00:00Z"),
    }
}

/// What the tests arrange before building the fakes.
pub struct AiWorldSetup {
    pub model: FakeLLMProvider,
    /// `false` is a user with no API key: the factory resolves nothing.
    pub ai_configured: bool,
    pub rate_limited: bool,
    pub application: Application,
    pub owner: User,
    pub notes: Vec<Note>,
    pub cover_letters: Vec<DocumentDraft>,
    pub briefings: Vec<CompanyBriefing>,
    pub documents: Vec<Document>,
    pub work_experiences: Vec<WorkExperience>,
    pub educations: Vec<Education>,
    pub skills: Vec<Skill>,
    pub extractor: FakeDocumentTextExtractor,
    pub fetcher: FakeRemoteFileFetcher,
}

impl AiWorldSetup {
    pub fn replying(content: &str) -> Self {
        Self::with_model(FakeLLMProvider::new().reply(content))
    }

    pub fn with_model(model: FakeLLMProvider) -> Self {
        Self {
            model,
            ai_configured: true,
            rate_limited: false,
            application: application_owned_by(AI_APPLICATION, AI_OWNER),
            owner: user_with_email(AI_OWNER, "owner@example.com"),
            notes: Vec::new(),
            cover_letters: Vec::new(),
            briefings: Vec::new(),
            documents: Vec::new(),
            work_experiences: Vec::new(),
            educations: Vec::new(),
            skills: Vec::new(),
            extractor: FakeDocumentTextExtractor::default(),
            fetcher: FakeRemoteFileFetcher::default(),
        }
    }

    pub fn build(self) -> AiWorld {
        let model = Arc::new(self.model);
        let factory = if self.ai_configured {
            FakeLLMProviderFactory::with_provider(model.clone())
        } else {
            FakeLLMProviderFactory::default()
        };
        let limiter = if self.rate_limited {
            FixedRateLimiter::rejecting()
        } else {
            FixedRateLimiter::allowing()
        };
        AiWorld {
            model,
            factory: Arc::new(factory),
            limiter: Arc::new(limiter),
            applications: Arc::new(FakeApplicationRepository::with(vec![self.application])),
            users: Arc::new(FakeUserRepository::with(vec![self.owner])),
            notes: Arc::new(FakeNoteRepository::with(self.notes)),
            drafts: Arc::new(
                FakeDocumentDraftRepository::with(self.cover_letters)
                    .owned_by(AI_APPLICATION, AI_OWNER)
                    .owned_by(AI_OTHER_APPLICATION, AI_OWNER),
            ),
            briefings: Arc::new(FakeCompanyBriefingRepository::with(self.briefings)),
            documents: Arc::new(FakeDocumentRepository::with(self.documents)),
            work_experiences: Arc::new(FakeWorkExperienceRepository::with(self.work_experiences)),
            educations: Arc::new(FakeEducationRepository::with(self.educations)),
            skills: Arc::new(FakeSkillRepository::with(self.skills)),
            storage: Arc::new(FakeStorageProvider::default()),
            extractor: Arc::new(self.extractor),
            fetcher: Arc::new(self.fetcher),
        }
    }
}

pub struct AiWorld {
    pub model: Arc<FakeLLMProvider>,
    pub factory: Arc<FakeLLMProviderFactory>,
    pub limiter: Arc<FixedRateLimiter>,
    pub applications: Arc<FakeApplicationRepository>,
    pub users: Arc<FakeUserRepository>,
    pub notes: Arc<FakeNoteRepository>,
    pub drafts: Arc<FakeDocumentDraftRepository>,
    pub briefings: Arc<FakeCompanyBriefingRepository>,
    pub documents: Arc<FakeDocumentRepository>,
    pub work_experiences: Arc<FakeWorkExperienceRepository>,
    pub educations: Arc<FakeEducationRepository>,
    pub skills: Arc<FakeSkillRepository>,
    pub storage: Arc<FakeStorageProvider>,
    pub extractor: Arc<FakeDocumentTextExtractor>,
    pub fetcher: Arc<FakeRemoteFileFetcher>,
}

impl AiWorld {
    /// The one `complete` call the model received.
    pub fn only_call(&self) -> FakeLlmCall {
        let calls = self.model.calls();
        assert_eq!(calls.len(), 1, "expected exactly one model call, got {}", calls.len());
        calls[0].clone()
    }

    pub fn messages(&self) -> Vec<LlmMessage> {
        self.only_call().messages().to_vec()
    }

    /// The last message of the one call: the user prompt.
    pub fn user_prompt(&self) -> String {
        self.messages().last().map(|message| message.content.clone()).unwrap_or_default()
    }
}
