//! The MCP write tools. Reached only after the controller has checked the
//! token's scope (`tools/call` refuses write tools for a read token).

use serde_json::Value;

use super::controller::{ToolFailure, ToolOutcome};
use crate::domain::application::ApplicationStatus;
use crate::domain::interview_round::InterviewRoundType;
use crate::http::graphql::js_date::parse_js_date;
use crate::use_cases::chat::chat_tools::to_str;
use crate::use_cases::chat::tool_entities as entities;
use crate::use_cases::client_date::ClientDate;
use crate::use_cases::education::{
    CreateEducationInput, CreateEducationUseCase, UpdateEducationInput, UpdateEducationUseCase,
};
use crate::use_cases::interview_rounds::{CreateInterviewRoundInput, CreateInterviewRoundUseCase};
use crate::use_cases::jobs::{
    CreateApplicationInput, CreateApplicationUseCase, UpdateApplicationInput,
    UpdateApplicationUseCase,
};
use crate::use_cases::notes::{CreateNoteInput, CreateNoteUseCase};
use crate::use_cases::skills::{
    CreateSkillInput, CreateSkillUseCase, UpdateSkillInput, UpdateSkillUseCase,
};
use crate::use_cases::work_experience::{
    CreateWorkExperienceInput, CreateWorkExperienceUseCase, UpdateWorkExperienceInput,
    UpdateWorkExperienceUseCase,
};

pub struct WriteToolDeps {
    pub create_application_use_case: CreateApplicationUseCase,
    pub update_application_use_case: UpdateApplicationUseCase,
    pub create_note_use_case: CreateNoteUseCase,
    pub create_interview_round_use_case: CreateInterviewRoundUseCase,
    pub create_skill_use_case: CreateSkillUseCase,
    pub update_skill_use_case: UpdateSkillUseCase,
    pub create_education_use_case: CreateEducationUseCase,
    pub update_education_use_case: UpdateEducationUseCase,
    pub create_work_experience_use_case: CreateWorkExperienceUseCase,
    pub update_work_experience_use_case: UpdateWorkExperienceUseCase,
}

fn invalid(message: &str) -> ToolFailure {
    ToolFailure::InvalidParams(message.to_string())
}

fn text(args: &Value, key: &str) -> Option<String> {
    to_str(args.get(key))
}

/// `toDate`: anything that is not a real date is dropped rather than carried
/// as an Invalid Date.
fn date(args: &Value, key: &str) -> Option<chrono::DateTime<chrono::Utc>> {
    match parse_js_date(&text(args, key)?) {
        ClientDate::Valid(instant) => Some(instant),
        ClientDate::Invalid => None,
    }
}

fn client(date: Option<chrono::DateTime<chrono::Utc>>) -> Option<ClientDate> {
    date.map(ClientDate::Valid)
}

/// `apps/api` stores whatever string a client sends as the status; this
/// port's status is a closed enum, so an unknown one is refused.
fn status(args: &Value) -> Result<Option<ApplicationStatus>, ToolFailure> {
    match text(args, "status") {
        None => Ok(None),
        Some(raw) => ApplicationStatus::parse(&raw)
            .map(Some)
            .ok_or_else(|| ToolFailure::InvalidParams(format!("Unknown status \"{raw}\""))),
    }
}

fn round_type(args: &Value) -> Result<Option<InterviewRoundType>, ToolFailure> {
    match text(args, "type") {
        None => Ok(None),
        Some(raw) => InterviewRoundType::parse(&raw).map(Some).ok_or_else(|| {
            let allowed: Vec<&str> = InterviewRoundType::ALL.iter().map(|t| t.as_str()).collect();
            ToolFailure::InvalidParams(format!(
                "Unknown interview round type \"{raw}\"; use one of {}",
                allowed.join(", ")
            ))
        }),
    }
}

/// Only the fields provided change: `Some(Some(v))` sets, `None` leaves alone.
fn set(value: Option<String>) -> Option<Option<String>> {
    value.map(Some)
}

pub(super) async fn dispatch(
    deps: &WriteToolDeps,
    name: &str,
    args: &Value,
    user_id: &str,
) -> ToolOutcome {
    let user = user_id.to_string();
    Ok(match name {
        "create_application" => {
            let (Some(company), Some(role)) = (text(args, "company"), text(args, "role")) else {
                return Err(invalid("company and role are required"));
            };
            let created = deps
                .create_application_use_case
                .execute(CreateApplicationInput {
                    user_id: user,
                    company,
                    role,
                    status: status(args)?,
                    job_url: text(args, "jobUrl"),
                    location: text(args, "location"),
                    salary_range: text(args, "salaryRange"),
                    description: text(args, "description"),
                    starred: None,
                    source: text(args, "source"),
                    follow_up_at: None,
                    tags: None,
                })
                .await?;
            entities::application(&created)
        }
        "update_application" => {
            let Some(application_id) = text(args, "applicationId") else {
                return Err(invalid("applicationId is required"));
            };
            let updated = deps
                .update_application_use_case
                .execute(UpdateApplicationInput {
                    user_id: user,
                    application_id,
                    company: text(args, "company"),
                    role: text(args, "role"),
                    status: status(args)?,
                    job_url: set(text(args, "jobUrl")),
                    location: set(text(args, "location")),
                    salary_range: set(text(args, "salaryRange")),
                    description: set(text(args, "description")),
                    starred: None,
                    source: set(text(args, "source")),
                    follow_up_at: None,
                    tags: None,
                })
                .await?;
            entities::application(&updated)
        }
        "create_note" => {
            let (Some(application_id), Some(content)) =
                (text(args, "applicationId"), text(args, "content"))
            else {
                return Err(invalid("applicationId and content are required"));
            };
            let note = deps
                .create_note_use_case
                .execute(CreateNoteInput { user_id: user, application_id, content })
                .await?;
            entities::note(&note)
        }
        "create_interview_round" => {
            let Some(application_id) = text(args, "applicationId") else {
                return Err(invalid("applicationId is required"));
            };
            let round = deps
                .create_interview_round_use_case
                .execute(CreateInterviewRoundInput {
                    user_id: user,
                    application_id,
                    r#type: round_type(args)?,
                    scheduled_at: date(args, "scheduledAt"),
                    completed_at: None,
                    interviewer_name: text(args, "interviewerName"),
                    notes: text(args, "notes"),
                    outcome: None,
                })
                .await?;
            entities::interview_round(&round)
        }
        "create_skill" => {
            let Some(skill_name) = text(args, "name") else {
                return Err(invalid("name is required"));
            };
            let skill = deps
                .create_skill_use_case
                .execute(CreateSkillInput {
                    user_id: user,
                    name: skill_name,
                    category: text(args, "category"),
                    proficiency: text(args, "proficiency"),
                })
                .await?;
            entities::skill(&skill)
        }
        "update_skill" => {
            let Some(id) = text(args, "skillId") else {
                return Err(invalid("skillId is required"));
            };
            let skill = deps
                .update_skill_use_case
                .execute(UpdateSkillInput {
                    id,
                    user_id: user,
                    name: text(args, "name"),
                    category: set(text(args, "category")),
                    proficiency: set(text(args, "proficiency")),
                })
                .await?;
            entities::skill(&skill)
        }
        "create_education" => {
            // startDate is required by the use case, so an unparseable one has
            // to be refused rather than dropped.
            let (Some(institution), Some(start_date)) =
                (text(args, "institution"), date(args, "startDate"))
            else {
                return Err(invalid("institution and a valid ISO 8601 startDate are required"));
            };
            let education = deps
                .create_education_use_case
                .execute(CreateEducationInput {
                    user_id: user,
                    institution,
                    degree: text(args, "degree"),
                    field: text(args, "field"),
                    start_date: ClientDate::Valid(start_date),
                    end_date: client(date(args, "endDate")),
                    description: text(args, "description"),
                })
                .await?;
            entities::education(&education)
        }
        "update_education" => {
            let Some(id) = text(args, "educationId") else {
                return Err(invalid("educationId is required"));
            };
            let education = deps
                .update_education_use_case
                .execute(UpdateEducationInput {
                    id,
                    user_id: user,
                    institution: text(args, "institution"),
                    degree: set(text(args, "degree")),
                    field: set(text(args, "field")),
                    start_date: client(date(args, "startDate")),
                    end_date: client(date(args, "endDate")).map(Some),
                    description: set(text(args, "description")),
                })
                .await?;
            entities::education(&education)
        }
        "create_work_experience" => {
            let (Some(company), Some(title), Some(start_date)) =
                (text(args, "company"), text(args, "title"), date(args, "startDate"))
            else {
                return Err(invalid("company, title and a valid ISO 8601 startDate are required"));
            };
            let work = deps
                .create_work_experience_use_case
                .execute(CreateWorkExperienceInput {
                    user_id: user,
                    company,
                    title,
                    location: text(args, "location"),
                    start_date: ClientDate::Valid(start_date),
                    end_date: client(date(args, "endDate")),
                    description: text(args, "description"),
                })
                .await?;
            entities::work_experience(&work)
        }
        "update_work_experience" => {
            let Some(id) = text(args, "workExperienceId") else {
                return Err(invalid("workExperienceId is required"));
            };
            let work = deps
                .update_work_experience_use_case
                .execute(UpdateWorkExperienceInput {
                    id,
                    user_id: user,
                    company: text(args, "company"),
                    title: text(args, "title"),
                    location: set(text(args, "location")),
                    start_date: client(date(args, "startDate")),
                    end_date: client(date(args, "endDate")).map(Some),
                    description: set(text(args, "description")),
                })
                .await?;
            entities::work_experience(&work)
        }
        // The controller only hands over names the catalogue lists.
        other => {
            return Err(ToolFailure::InvalidParams(format!("Unknown tool: {other}")));
        }
    })
}
