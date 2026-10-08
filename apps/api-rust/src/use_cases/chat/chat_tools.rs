//! Tool dispatch for the chat assistant: the read tools, each result shaped
//! (`chat_tool_projection`) before the model sees it.

use std::sync::Arc;

use serde_json::Value;

use super::chat_tool_projection::{
    compact_for_model, page_json, project_application_detail, project_application_summary,
};
use super::tool_entities as entities;
use super::tool_json::ToolJson;
use crate::domain::application::ApplicationStatus;
use crate::use_cases::activity_logs::{
    GetActivityLogsInput, GetActivityLogsUseCase, GetResponseTimeAnalyticsInput,
    GetResponseTimeAnalyticsUseCase,
};
use crate::use_cases::applications::{
    GetApplicationChannelAnalyticsInput, GetApplicationChannelAnalyticsUseCase,
};
use crate::use_cases::calendar::{GetCalendarEventsInput, GetCalendarEventsUseCase};
use crate::use_cases::constants::chat;
use crate::use_cases::contacts::{GetContactsInput, GetContactsUseCase};
use crate::use_cases::documents::{GetDocumentsInput, GetDocumentsUseCase};
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::interview_rounds::{
    GetInterviewRoundAnalyticsInput, GetInterviewRoundAnalyticsUseCase, GetInterviewRoundsInput,
    GetInterviewRoundsUseCase,
};
use crate::use_cases::jobs::{
    GetApplicationInput, GetApplicationUseCase, GetApplicationsPageInput,
    GetApplicationsPageUseCase,
};
use crate::use_cases::notes::{GetNotesInput, GetNotesUseCase};
use crate::use_cases::offers::{
    GetOfferAnalyticsInput, GetOfferAnalyticsUseCase, GetOffersInput, GetOffersUseCase,
};
use crate::use_cases::ports::llm_provider::LlmToolCall;
use crate::use_cases::ports::tool_call_observer::{
    observe, ToolCallMeta, ToolCallObserver, ToolSurface,
};
use crate::use_cases::ports::{EducationRepository, SkillRepository, WorkExperienceRepository};

/// The read tools' collaborators, shared by the chat assistant and the MCP
/// controller's read tools.
pub struct ChatToolDeps {
    pub get_applications_page_use_case: GetApplicationsPageUseCase,
    pub get_application_use_case: GetApplicationUseCase,
    pub get_notes_use_case: GetNotesUseCase,
    pub get_contacts_use_case: GetContactsUseCase,
    pub get_interview_rounds_use_case: GetInterviewRoundsUseCase,
    pub get_documents_use_case: GetDocumentsUseCase,
    pub get_offers_use_case: GetOffersUseCase,
    pub get_activity_logs_use_case: GetActivityLogsUseCase,
    pub get_calendar_events_use_case: GetCalendarEventsUseCase,
    pub get_response_time_analytics_use_case: GetResponseTimeAnalyticsUseCase,
    pub get_application_channel_analytics_use_case: GetApplicationChannelAnalyticsUseCase,
    pub get_interview_round_analytics_use_case: GetInterviewRoundAnalyticsUseCase,
    pub get_offer_analytics_use_case: GetOfferAnalyticsUseCase,
    pub work_experience_repository: Arc<dyn WorkExperienceRepository>,
    pub education_repository: Arc<dyn EducationRepository>,
    pub skill_repository: Arc<dyn SkillRepository>,
    pub tool_call_observer: Arc<dyn ToolCallObserver>,
}

/// Tool arguments come from the model, so a numeric field may arrive as a
/// number, a numeric string, or nonsense. Anything that isn't a positive
/// integer falls back to `None`, letting the use case apply its own default
/// and clamp (`Number.isInteger(Number(value)) && n > 0`).
pub fn to_positive_int(value: &Value) -> Option<i64> {
    let number = match value {
        Value::Number(n) => n.as_f64()?,
        Value::String(text) => {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                0.0
            } else {
                trimmed.parse::<f64>().ok()?
            }
        }
        Value::Bool(true) => 1.0,
        _ => return None,
    };
    (number.fract() == 0.0 && number > 0.0 && number < 9.0e15).then_some(number as i64)
}

/// `typeof value === 'string' && value.length > 0 ? value : undefined`.
pub fn to_str(value: Option<&Value>) -> Option<String> {
    value.and_then(Value::as_str).filter(|text| !text.is_empty()).map(str::to_string)
}

/// `String(args.applicationId ?? '')`.
fn application_id_arg(args: &Value) -> String {
    match args.get("applicationId") {
        None | Some(Value::Null) => String::new(),
        Some(Value::String(text)) => text.clone(),
        Some(Value::Number(n)) => n.to_string(),
        Some(Value::Bool(b)) => b.to_string(),
        Some(Value::Array(_)) => String::new(),
        Some(Value::Object(_)) => "[object Object]".to_string(),
    }
}

/// Runs one tool for the model. The reply is always a value the model can
/// read: a failed tool answers `{ error }` so the model can recover or
/// explain. Every call is observed, whatever its outcome.
pub async fn execute_chat_tool(
    call: &LlmToolCall,
    user_id: &str,
    deps: &ChatToolDeps,
) -> ToolJson {
    let meta = ToolCallMeta {
        surface: ToolSurface::Chat,
        name: call.name.clone(),
        token_scope: None,
    };
    observe(deps.tool_call_observer.as_ref(), meta, |observed| async move {
        match dispatch_chat_tool(call, user_id, deps).await {
            Ok(result) => {
                observed.succeeded();
                // Every result is compacted on the way out.
                compact_for_model(&result).unwrap_or(ToolJson::Null)
            }
            Err(error) => {
                // Reported before it is swallowed: the model gets a reply
                // either way, but a trace should still tell a bug from
                // "Application not found" (JEF-365).
                observed.failed(&error);
                // A coded error's message was written for a person and helps
                // the model recover. Anything else is an internal failure
                // whose message the model would happily paraphrase.
                let message = match &error {
                    DomainError::Coded { message, .. } => message.clone(),
                    DomainError::Internal(_) => "Tool call failed".to_string(),
                };
                ToolJson::object(vec![("error", ToolJson::Str(message))])
            }
        }
    })
    .await
}

async fn dispatch_chat_tool(
    call: &LlmToolCall,
    user_id: &str,
    deps: &ChatToolDeps,
) -> DomainResult<ToolJson> {
    let args = &call.arguments;
    let application_id = application_id_arg(args);
    let user = user_id.to_string();

    Ok(match call.name.as_str() {
        "list_applications" => {
            let status = match args.get("status") {
                None | Some(Value::Null) => None,
                Some(value) => match value.as_str().and_then(ApplicationStatus::parse) {
                    Some(status) => Some(status),
                    // A status no application has: the original filters on it
                    // and finds nothing.
                    None => return Ok(empty_page()),
                },
            };
            let page = deps
                .get_applications_page_use_case
                .execute(GetApplicationsPageInput {
                    user_id: user,
                    status,
                    cursor: args.get("cursor").and_then(Value::as_str).map(str::to_string),
                    limit: Some(
                        args.get("limit")
                            .and_then(to_positive_int_ref)
                            .unwrap_or(chat::LIST_DEFAULT_LIMIT),
                    ),
                    ..GetApplicationsPageInput::default()
                })
                .await?;
            page_json(&page, project_application_summary)
        }
        "get_application" => {
            let application = deps
                .get_application_use_case
                .execute(GetApplicationInput {
                    user_id: user,
                    application_id,
                    include_trashed: false,
                })
                .await?;
            project_application_detail(&application)
        }
        "list_notes" => entities::notes(
            &deps.get_notes_use_case.execute(GetNotesInput { user_id: user, application_id }).await?,
        ),
        "list_contacts" => entities::contacts(
            &deps
                .get_contacts_use_case
                .execute(GetContactsInput { user_id: user, application_id })
                .await?,
        ),
        "list_interview_rounds" => entities::interview_rounds(
            &deps
                .get_interview_rounds_use_case
                .execute(GetInterviewRoundsInput { user_id: user, application_id })
                .await?,
        ),
        "list_work_experiences" => {
            entities::work_experiences(&deps.work_experience_repository.find_all_by_user_id(&user).await?)
        }
        "list_educations" => {
            entities::educations(&deps.education_repository.find_all_by_user_id(&user).await?)
        }
        "list_skills" => entities::skills(&deps.skill_repository.find_all_by_user_id(&user).await?),
        "list_documents" => entities::documents(
            &deps
                .get_documents_use_case
                .execute(GetDocumentsInput { user_id: user, application_id })
                .await?,
        ),
        "list_offers" => entities::offers(
            &deps
                .get_offers_use_case
                .execute(GetOffersInput { user_id: user, application_id })
                .await?,
        ),
        "list_activity" => entities::activity_logs(
            &deps
                .get_activity_logs_use_case
                .execute(GetActivityLogsInput { user_id: user, application_id })
                .await?,
        ),
        "list_calendar_events" => entities::calendar_events(
            &deps.get_calendar_events_use_case.execute(GetCalendarEventsInput { user_id: user }).await?,
        ),
        "get_analytics" => analytics(deps, user_id).await?,
        // Returned as an error rather than answered, so the observer counts it
        // as bad input; the model still reads `{ error: 'Unknown tool: …' }`.
        other => return Err(DomainError::validation(format!("Unknown tool: {other}"))),
    })
}

fn to_positive_int_ref(value: &Value) -> Option<i64> {
    to_positive_int(value)
}

fn empty_page() -> ToolJson {
    ToolJson::object(vec![
        ("items", ToolJson::Array(Vec::new())),
        ("nextCursor", ToolJson::Null),
        ("hasNextPage", ToolJson::Bool(false)),
    ])
}

/// The four aggregates, fetched together; also what MCP's `get_analytics` returns.
pub async fn analytics(deps: &ChatToolDeps, user_id: &str) -> DomainResult<ToolJson> {
    let user = || user_id.to_string();
    let (response_time, channels, interview_rounds, offers) = tokio::try_join!(
        deps.get_response_time_analytics_use_case
            .execute(GetResponseTimeAnalyticsInput { user_id: user() }),
        deps.get_application_channel_analytics_use_case
            .execute(GetApplicationChannelAnalyticsInput { user_id: user() }),
        deps.get_interview_round_analytics_use_case
            .execute(GetInterviewRoundAnalyticsInput { user_id: user() }),
        deps.get_offer_analytics_use_case.execute(GetOfferAnalyticsInput { user_id: user() }),
    )?;
    Ok(ToolJson::object(vec![
        ("responseTime", entities::response_time_analytics(&response_time)),
        ("channels", entities::channel_analytics(&channels)),
        ("interviewRounds", entities::interview_round_analytics(&interview_rounds)),
        ("offers", entities::offer_analytics(&offers)),
    ]))
}
