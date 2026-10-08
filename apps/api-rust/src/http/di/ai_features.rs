use std::sync::Arc;

use crate::http::container::Container;
use crate::infrastructure::storage::HttpRemoteFileFetcher;
use crate::use_cases::company_briefing::{
    GenerateCompanyBriefingUseCase, GetCompanyBriefingUseCase,
};
use crate::use_cases::cover_letter::{GenerateCoverLetterDraftUseCase, GenerateCoverLetterUseCase};
use crate::use_cases::job_description::ParseJobDescriptionUseCase;
use crate::use_cases::resume::{GenerateResumeDraftUseCase, GenerateResumeUseCase};
use crate::use_cases::resume_match::ComputeResumeMatchScoreUseCase;
use crate::use_cases::shared::token_limit::system_now;

impl Container {
    pub fn generate_cover_letter_use_case(&self) -> GenerateCoverLetterUseCase {
        GenerateCoverLetterUseCase {
            llm_provider_factory: self.llm_provider_factory(),
            application_repository: self.application_repository.clone(),
            work_experience_repository: self.work_experience_repository.clone(),
            education_repository: self.education_repository.clone(),
            skill_repository: self.skill_repository.clone(),
            user_repository: self.user_repository.clone(),
            generate_cover_letter_rate_limiter: self
                .services
                .rate_limiters
                .generate_cover_letter
                .clone(),
            note_repository: self.note_repository.clone(),
            document_draft_repository: self.document_draft_repository.clone(),
            company_briefing_repository: self.company_briefing_repository.clone(),
        }
    }

    pub fn generate_cover_letter_draft_use_case(&self) -> GenerateCoverLetterDraftUseCase {
        GenerateCoverLetterDraftUseCase {
            generate_cover_letter_use_case: self.generate_cover_letter_use_case(),
            document_draft_repository: self.document_draft_repository.clone(),
            application_repository: self.application_repository.clone(),
            generate_id: self.generate_id.clone(),
            now: system_now(),
        }
    }

    pub fn generate_resume_use_case(&self) -> GenerateResumeUseCase {
        GenerateResumeUseCase {
            llm_provider_factory: self.llm_provider_factory(),
            application_repository: self.application_repository.clone(),
            work_experience_repository: self.work_experience_repository.clone(),
            education_repository: self.education_repository.clone(),
            skill_repository: self.skill_repository.clone(),
            user_repository: self.user_repository.clone(),
            generate_resume_rate_limiter: self.services.rate_limiters.generate_resume.clone(),
            note_repository: self.note_repository.clone(),
            document_draft_repository: self.document_draft_repository.clone(),
        }
    }

    pub fn generate_resume_draft_use_case(&self) -> GenerateResumeDraftUseCase {
        GenerateResumeDraftUseCase {
            generate_resume_use_case: self.generate_resume_use_case(),
            document_draft_repository: self.document_draft_repository.clone(),
            application_repository: self.application_repository.clone(),
            generate_id: self.generate_id.clone(),
            now: system_now(),
        }
    }

    pub fn get_company_briefing_use_case(&self) -> GetCompanyBriefingUseCase {
        GetCompanyBriefingUseCase {
            application_repository: self.application_repository.clone(),
            company_briefing_repository: self.company_briefing_repository.clone(),
        }
    }

    pub fn generate_company_briefing_use_case(&self) -> GenerateCompanyBriefingUseCase {
        GenerateCompanyBriefingUseCase {
            llm_provider_factory: self.llm_provider_factory(),
            application_repository: self.application_repository.clone(),
            user_repository: self.user_repository.clone(),
            generate_company_briefing_rate_limiter: self
                .services
                .rate_limiters
                .generate_company_briefing
                .clone(),
            company_briefing_repository: self.company_briefing_repository.clone(),
            generate_id: self.generate_id.clone(),
            now: system_now(),
        }
    }

    pub fn parse_job_description_use_case(&self) -> ParseJobDescriptionUseCase {
        ParseJobDescriptionUseCase {
            llm_provider_factory: self.llm_provider_factory(),
            job_posting_source_resolver: self.services.job_posting_source_resolver.clone(),
            parse_job_description_rate_limiter: self
                .services
                .rate_limiters
                .parse_job_description
                .clone(),
        }
    }

    pub fn compute_resume_match_score_use_case(&self) -> ComputeResumeMatchScoreUseCase {
        ComputeResumeMatchScoreUseCase {
            application_repository: self.application_repository.clone(),
            document_repository: self.document_repository.clone(),
            storage_provider: self.services.storage_provider.clone(),
            // TODO(wiring): a `Services` singleton sharing the process's
            // HTTP client; built per call here because `Services` could not
            // be edited in the change that added it.
            remote_file_fetcher: Arc::new(HttpRemoteFileFetcher::default()),
            document_text_extractor: self.services.document_text_extractor.clone(),
            llm_provider_factory: self.llm_provider_factory(),
            work_experience_repository: self.work_experience_repository.clone(),
            education_repository: self.education_repository.clone(),
            skill_repository: self.skill_repository.clone(),
            compute_resume_match_score_rate_limiter: self
                .services
                .rate_limiters
                .compute_resume_match_score
                .clone(),
        }
    }
}
