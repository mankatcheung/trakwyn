use async_graphql::{Context, Object, Result, SimpleObject, ID};

use super::document_drafts::DocumentDraftObject;
use super::support::{container, require_user};
use crate::http::errors::GraphQLResultExt;
use crate::use_cases::cover_letter::GenerateCoverLetterDraftCommand;
use crate::use_cases::job_description::{ParseJobDescriptionInput, ParsedJobDescription};
use crate::use_cases::resume::GenerateResumeDraftCommand;
use crate::use_cases::resume_match::{ComputeResumeMatchScoreInput, ResumeMatchScore};

#[derive(SimpleObject)]
#[graphql(name = "ParsedJobDescription")]
pub struct ParsedJobDescriptionObject {
    company: Option<String>,
    role: Option<String>,
    location: Option<String>,
    salary: Option<String>,
    description: Option<String>,
}

impl From<ParsedJobDescription> for ParsedJobDescriptionObject {
    fn from(parsed: ParsedJobDescription) -> Self {
        Self {
            company: parsed.company,
            role: parsed.role,
            location: parsed.location,
            salary: parsed.salary,
            description: parsed.description,
        }
    }
}

#[derive(SimpleObject)]
#[graphql(name = "ResumeMatchScore")]
pub struct ResumeMatchScoreObject {
    score: Option<i32>,
    label: Option<String>,
    matched_keywords: Option<Vec<String>>,
    missing_keywords: Option<Vec<String>>,
    summary: Option<String>,
}

impl From<ResumeMatchScore> for ResumeMatchScoreObject {
    fn from(score: ResumeMatchScore) -> Self {
        Self {
            score: Some(score.score),
            label: Some(score.label),
            matched_keywords: Some(score.matched_keywords),
            missing_keywords: Some(score.missing_keywords),
            summary: Some(score.summary),
        }
    }
}

#[derive(Default)]
pub struct AiFeaturesMutation;

#[Object]
impl AiFeaturesMutation {
    // Returns the saved draft rather than the letter as a string: the
    // generated text is persisted (JEF-195), and the client needs its id to
    // open it in the editor.
    async fn generate_cover_letter(
        &self,
        ctx: &Context<'_>,
        application_id: ID,
        resume_text: Option<String>,
    ) -> Result<Option<DocumentDraftObject>> {
        let user = require_user(ctx)?;
        let draft = container(ctx)
            .generate_cover_letter_draft_use_case()
            .execute(GenerateCoverLetterDraftCommand {
                user_id: user.sub.clone(),
                application_id: application_id.0,
                resume_text,
            })
            .await
            .gql()?;
        Ok(Some(draft.into()))
    }

    // Returns the saved draft, like `generateCoverLetter`.
    async fn generate_resume(
        &self,
        ctx: &Context<'_>,
        application_id: ID,
    ) -> Result<Option<DocumentDraftObject>> {
        let user = require_user(ctx)?;
        let draft = container(ctx)
            .generate_resume_draft_use_case()
            .execute(GenerateResumeDraftCommand {
                user_id: user.sub.clone(),
                application_id: application_id.0,
            })
            .await
            .gql()?;
        Ok(Some(draft.into()))
    }

    async fn compute_resume_match_score(
        &self,
        ctx: &Context<'_>,
        application_id: ID,
        resume_text: Option<String>,
    ) -> Result<Option<ResumeMatchScoreObject>> {
        let user = require_user(ctx)?;
        let score = container(ctx)
            .compute_resume_match_score_use_case()
            .execute(ComputeResumeMatchScoreInput {
                user_id: user.sub.clone(),
                application_id: application_id.0,
                resume_text,
            })
            .await
            .gql()?;
        Ok(Some(score.into()))
    }

    async fn parse_job_description(
        &self,
        ctx: &Context<'_>,
        text: Option<String>,
        url: Option<String>,
    ) -> Result<Option<ParsedJobDescriptionObject>> {
        let user = require_user(ctx)?;
        let parsed = container(ctx)
            .parse_job_description_use_case()
            .execute(ParseJobDescriptionInput { user_id: user.sub.clone(), text, url })
            .await
            .gql()?;
        Ok(Some(parsed.into()))
    }
}
