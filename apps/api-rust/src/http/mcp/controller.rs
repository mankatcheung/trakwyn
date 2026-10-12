//! Translates MCP JSON-RPC requests into use-case calls. This is the
//! interface adapter for the MCP transport — the equivalent of a GraphQL
//! resolver, kept out of the route so the route stays pure transport (auth
//! and I/O).

use serde_json::{json, Map, Value};

use super::constants::{
    json_rpc_error, method, INSTRUCTIONS, JSONRPC_VERSION, PROTOCOL_VERSION, SERVER_NAME,
    SERVER_VERSION,
};
use super::tool_catalogue::{advertise, mcp_tools, ToolAccess, ToolDefinition};
use super::write_tools::{self, WriteToolDeps};
use crate::domain::api_token::ApiTokenScope;
use crate::domain::application::ApplicationStatus;
use crate::use_cases::chat::chat_tool_projection::{page_json, project_application_summary};
use crate::use_cases::chat::chat_tools::{analytics, to_positive_int, to_str};
use crate::use_cases::chat::tool_entities as entities;
use crate::use_cases::chat::tool_json::ToolJson;
use crate::use_cases::chat::ChatToolDeps;
use crate::use_cases::errors::{DomainError, ErrorCode};
use crate::use_cases::jobs::{GetApplicationInput, GetApplicationsPageInput};
use crate::use_cases::ports::tool_call_observer::{
    observe, ToolCallMeta, ToolCallRecorder, ToolSurface,
};

/// The controller's response to the transport: a JSON-RPC `body` plus the
/// HTTP status. Protocol-level errors (unknown method, unknown tool) travel
/// as normal `200` JSON-RPC error bodies; only a malformed envelope is `400`.
#[derive(Debug, Clone, PartialEq)]
pub struct McpResult {
    pub status: u16,
    pub body: Value,
}

pub struct McpController {
    pub reads: ChatToolDeps,
    pub writes: WriteToolDeps,
}

/// How a tool call failed before it produced a result.
pub(super) enum ToolFailure {
    /// An argument check failed: answered as INVALID_PARAMS.
    InvalidParams(String),
    /// A use case failed.
    Domain(DomainError),
}

impl From<DomainError> for ToolFailure {
    fn from(error: DomainError) -> Self {
        Self::Domain(error)
    }
}

pub(super) type ToolOutcome = Result<ToolJson, ToolFailure>;

/// `String(value)` for the shapes a JSON-RPC `method` can take.
fn js_string(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Null => "null".to_string(),
        Value::Array(_) => String::new(),
        Value::Object(_) => "[object Object]".to_string(),
    }
}

/// JavaScript truthiness of a parsed JSON value.
fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().is_some_and(|n| n != 0.0),
        Value::String(text) => !text.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

fn envelope(id: Option<&Value>, key: &str, payload: Value) -> Value {
    let mut body = Map::new();
    body.insert("jsonrpc".into(), json!(JSONRPC_VERSION));
    // `id: undefined` is dropped by `JSON.stringify`.
    if let Some(id) = id {
        body.insert("id".into(), id.clone());
    }
    body.insert(key.into(), payload);
    Value::Object(body)
}

fn error(id: Option<&Value>, code: i64, message: &str) -> Value {
    envelope(id, "error", json!({ "code": code, "message": message }))
}

impl McpController {
    pub async fn handle(&self, raw_body: &Value, user_id: &str, scope: ApiTokenScope) -> McpResult {
        let body = raw_body.as_object();
        let invalid = body.is_none_or(|body| {
            body.get("jsonrpc") != Some(&json!(JSONRPC_VERSION))
                || !body.get("method").is_some_and(truthy)
        });
        if invalid {
            let id = body.and_then(|body| body.get("id")).filter(|id| !id.is_null());
            let null = Value::Null;
            return McpResult {
                status: 400,
                body: error(
                    Some(id.unwrap_or(&null)),
                    json_rpc_error::INVALID_REQUEST,
                    "Invalid Request",
                ),
            };
        }
        let body = body.cloned().unwrap_or_default();
        let id = body.get("id");
        let method_name = body.get("method").map(js_string).unwrap_or_default();
        let params = body.get("params");

        let response = match method_name.as_str() {
            method::INITIALIZE => envelope(
                id,
                "result",
                json!({
                    "protocolVersion": PROTOCOL_VERSION,
                    "capabilities": { "tools": {} },
                    "serverInfo": { "name": SERVER_NAME, "version": SERVER_VERSION },
                    "instructions": INSTRUCTIONS,
                }),
            ),
            method::TOOLS_LIST => {
                // A read-only token isn't shown write tools at all.
                // Enforcement still happens in tools/call — hiding them is a
                // convenience for the model, not the security boundary.
                let visible: Vec<&ToolDefinition> = mcp_tools()
                    .iter()
                    .filter(|tool| scope == ApiTokenScope::Full || tool.access == ToolAccess::Read)
                    .collect();
                envelope(id, "result", json!({ "tools": advertise(&visible) }))
            }
            method::TOOLS_CALL => self.call_tool(id, params, user_id, scope).await,
            other => {
                error(id, json_rpc_error::METHOD_NOT_FOUND, &format!("Method not found: {other}"))
            }
        };
        McpResult { status: 200, body: response }
    }

    async fn call_tool(
        &self,
        id: Option<&Value>,
        params: Option<&Value>,
        user_id: &str,
        scope: ApiTokenScope,
    ) -> Value {
        let tool_name = params.and_then(|p| p.get("name")).and_then(Value::as_str);
        // Wraps the whole call, refusal and argument checks included, so
        // every tools/call is counted once however it ends (JEF-365).
        let meta = ToolCallMeta {
            surface: ToolSurface::Mcp,
            name: tool_name.unwrap_or_default().to_string(),
            token_scope: Some(scope),
        };
        observe(self.reads.tool_call_observer.as_ref(), meta, |observed| {
            self.run_tool(id, tool_name, params, user_id, scope, observed)
        })
        .await
    }

    async fn run_tool(
        &self,
        id: Option<&Value>,
        tool_name: Option<&str>,
        params: Option<&Value>,
        user_id: &str,
        scope: ApiTokenScope,
        observed: std::sync::Arc<ToolCallRecorder>,
    ) -> Value {
        // The security boundary. tools/list already hides write tools from a
        // read-only token, but a client can call anything it likes, so
        // refusal has to happen here — otherwise a token described as unable
        // to change anything could mutate data (JEF-170).
        let tool = mcp_tools().iter().find(|tool| Some(tool.name) == tool_name);
        if tool.is_some_and(|tool| tool.access == ToolAccess::Write) && scope != ApiTokenScope::Full
        {
            observed.refused(user_id);
            return error(
                id,
                json_rpc_error::INVALID_PARAMS,
                &format!(
                    "Tool \"{}\" requires a full-access API token; this token is read-only",
                    tool_name.unwrap_or_default()
                ),
            );
        }

        // JSON-RPC arguments are arbitrary JSON: anything that is not an
        // object reads as "no arguments".
        let empty = Value::Object(Map::new());
        let args = params
            .and_then(|p| p.get("arguments"))
            .filter(|arguments| arguments.is_object())
            .unwrap_or(&empty);

        let Some(tool) = tool else {
            observed.invalid_params();
            return error(
                id,
                json_rpc_error::METHOD_NOT_FOUND,
                &format!("Unknown tool: {}", tool_name.unwrap_or("undefined")),
            );
        };

        match self.dispatch(tool.name, args, user_id).await {
            Ok(result) => {
                // Compact, not pretty-printed: this goes straight into an
                // LLM's context window.
                observed.succeeded();
                envelope(
                    id,
                    "result",
                    json!({ "content": [{ "type": "text", "text": result.stringify() }] }),
                )
            }
            Err(ToolFailure::InvalidParams(message)) => {
                observed.invalid_params();
                error(id, json_rpc_error::INVALID_PARAMS, &message)
            }
            Err(ToolFailure::Domain(failure)) => {
                observed.failed(&failure);
                let (code, message) = match &failure {
                    DomainError::Coded { code, message, .. } => {
                        let client_error =
                            matches!(code, ErrorCode::NotFound | ErrorCode::Forbidden);
                        let rpc = if client_error {
                            json_rpc_error::INVALID_PARAMS
                        } else {
                            json_rpc_error::INTERNAL_ERROR
                        };
                        (rpc, message.as_str())
                    }
                    // `apps/api` answers with the raw error text here, which
                    // can quote a driver error; the message of an internal
                    // failure never reaches a client in this port.
                    DomainError::Internal(_) => (json_rpc_error::INTERNAL_ERROR, "Internal error"),
                };
                error(id, code, message)
            }
        }
    }

    async fn dispatch(&self, name: &str, args: &Value, user_id: &str) -> ToolOutcome {
        let user = user_id.to_string();
        let deps = &self.reads;
        let application_id = || {
            to_str(args.get("applicationId"))
                .ok_or_else(|| ToolFailure::InvalidParams("applicationId is required".to_string()))
        };

        Ok(match name {
            "list_applications" => {
                // A status no application has: filtered on, it finds nothing.
                let status = match to_str(args.get("status")) {
                    None => None,
                    Some(text) => match ApplicationStatus::parse(&text) {
                        Some(status) => Some(status),
                        None => return Ok(empty_page()),
                    },
                };
                let page = deps
                    .get_applications_page_use_case
                    .execute(GetApplicationsPageInput {
                        user_id: user,
                        status,
                        cursor: to_str(args.get("cursor")),
                        limit: args.get("limit").and_then(to_positive_int),
                        ..GetApplicationsPageInput::default()
                    })
                    .await?;
                // The same preview rows the chat assistant gets (T1/F4).
                // Nulls are kept — an MCP client is a program, and a missing
                // field reads as absent.
                page_json(&page, project_application_summary)
            }
            "get_application" => {
                let application = deps
                    .get_application_use_case
                    .execute(GetApplicationInput {
                        application_id: application_id()?,
                        user_id: user,
                        include_trashed: false,
                    })
                    .await?;
                entities::application(&application)
            }
            "list_notes" => entities::notes(
                &deps
                    .get_notes_use_case
                    .execute(crate::use_cases::notes::GetNotesInput {
                        application_id: application_id()?,
                        user_id: user,
                    })
                    .await?,
            ),
            "list_contacts" => entities::contacts(
                &deps
                    .get_contacts_use_case
                    .execute(crate::use_cases::contacts::GetContactsInput {
                        application_id: application_id()?,
                        user_id: user,
                    })
                    .await?,
            ),
            "list_interview_rounds" => entities::interview_rounds(
                &deps
                    .get_interview_rounds_use_case
                    .execute(crate::use_cases::interview_rounds::GetInterviewRoundsInput {
                        application_id: application_id()?,
                        user_id: user,
                    })
                    .await?,
            ),
            "list_work_experiences" => entities::work_experiences(
                &deps.work_experience_repository.find_all_by_user_id(&user).await?,
            ),
            "list_educations" => {
                entities::educations(&deps.education_repository.find_all_by_user_id(&user).await?)
            }
            "list_skills" => {
                entities::skills(&deps.skill_repository.find_all_by_user_id(&user).await?)
            }
            "list_documents" => entities::documents(
                &deps
                    .get_documents_use_case
                    .execute(crate::use_cases::documents::GetDocumentsInput {
                        application_id: application_id()?,
                        user_id: user,
                    })
                    .await?,
            ),
            "list_offers" => entities::offers(
                &deps
                    .get_offers_use_case
                    .execute(crate::use_cases::offers::GetOffersInput {
                        application_id: application_id()?,
                        user_id: user,
                    })
                    .await?,
            ),
            "list_activity" => entities::activity_logs(
                &deps
                    .get_activity_logs_use_case
                    .execute(crate::use_cases::activity_logs::GetActivityLogsInput {
                        application_id: application_id()?,
                        user_id: user,
                    })
                    .await?,
            ),
            "list_calendar_events" => entities::calendar_events(
                &deps
                    .get_calendar_events_use_case
                    .execute(crate::use_cases::calendar::GetCalendarEventsInput { user_id: user })
                    .await?,
            ),
            // Fetched together: each is a compact aggregate, and "how is my
            // search going?" wants all four.
            "get_analytics" => analytics(deps, user_id).await?,
            write => return write_tools::dispatch(&self.writes, write, args, user_id).await,
        })
    }
}

fn empty_page() -> ToolJson {
    ToolJson::object(vec![
        ("items", ToolJson::Array(Vec::new())),
        ("nextCursor", ToolJson::Null),
        ("hasNextPage", ToolJson::Bool(false)),
    ])
}
