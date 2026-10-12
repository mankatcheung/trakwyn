//! The single definition of every tool exposed to an LLM.
//!
//! A presentation contract — names, human-readable descriptions and JSON
//! Schema describing how capabilities are *described* to an external
//! consumer — so it sits in the `http` adapter layer, not in `use_cases`.
//! Nothing in `use_cases` imports it: the chat use case receives its tools as
//! an injected `Vec<LlmToolDefinition>` (see [`to_llm_tool_definitions`] and
//! `http/di/chat.rs`), so which surface exposes which tools is a composition
//! decision (JEF-177).
//!
//! `access` is internal metadata, not part of MCP's wire format: it drives
//! scope gating (a `read` token may not call a `write` tool) and the
//! per-surface selections below. Adapters strip it before advertising.
//!
//! Descriptions deliberately don't restate that a write tool needs a
//! full-access token (JEF-178): nobody it could inform ever reads it.

use std::sync::OnceLock;

use serde_json::{json, Value};

use crate::use_cases::constants::pagination;
use crate::use_cases::ports::llm_provider::LlmToolDefinition;

/// Whether a tool reads or mutates.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolAccess {
    Read,
    Write,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ToolDefinition {
    pub access: ToolAccess,
    pub name: &'static str,
    pub description: String,
    pub input_schema: Value,
}

fn tool(
    access: ToolAccess,
    name: &'static str,
    description: &str,
    input_schema: Value,
) -> ToolDefinition {
    ToolDefinition { access, name, description: description.to_string(), input_schema }
}

fn read(name: &'static str, description: &str, schema: Value) -> ToolDefinition {
    tool(ToolAccess::Read, name, description, schema)
}

fn write(name: &'static str, description: &str, schema: Value) -> ToolDefinition {
    tool(ToolAccess::Write, name, description, schema)
}

/// A tool whose only input is the application id.
fn application_scoped(name: &'static str, description: &str) -> ToolDefinition {
    read(
        name,
        description,
        json!({
            "type": "object",
            "properties": { "applicationId": { "type": "string", "description": "The application ID" } },
            "required": ["applicationId"],
        }),
    )
}

fn no_input(name: &'static str, description: &str) -> ToolDefinition {
    read(name, description, json!({ "type": "object", "properties": {} }))
}

fn build() -> Vec<ToolDefinition> {
    vec![
        read(
            "list_applications",
            "List job applications for the authenticated user, newest first. Returns one page; pass the returned nextCursor to fetch the next. Each row carries a short description preview — use get_application for the full text.",
            json!({
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "description": "Filter by status (e.g. draft, applied, interviewing, offer, rejected)",
                    },
                    "limit": {
                        "type": "number",
                        "description": format!(
                            "Applications per page (1-{}, default {})",
                            pagination::MAX_LIMIT,
                            pagination::DEFAULT_LIMIT
                        ),
                    },
                    "cursor": {
                        "type": "string",
                        "description": "nextCursor from a previous call, to fetch the following page",
                    },
                },
            }),
        ),
        read(
            "get_application",
            "Get a specific job application by ID",
            json!({
                "type": "object",
                "properties": { "applicationId": { "type": "string", "description": "The application ID" } },
                "required": ["applicationId"],
            }),
        ),
        application_scoped("list_notes", "List notes for a job application"),
        application_scoped("list_contacts", "List contacts associated with a job application"),
        application_scoped("list_interview_rounds", "List interview rounds for a job application"),
        no_input("list_work_experiences", "List all work experiences for the authenticated user"),
        no_input("list_educations", "List all education entries for the authenticated user"),
        no_input("list_skills", "List all skills for the authenticated user"),
        application_scoped(
            "list_documents",
            "List documents (resumes, cover letters, offer letters) attached to a job application",
        ),
        application_scoped(
            "list_offers",
            "List offers received for a job application, including compensation details",
        ),
        application_scoped(
            "list_activity",
            "List the activity/audit log for a job application — status changes and other events over time",
        ),
        no_input(
            "list_calendar_events",
            "List upcoming and past calendar events for the authenticated user — scheduled interviews and application follow-up dates",
        ),
        no_input(
            "get_analytics",
            "Aggregate job-search statistics for the authenticated user: response times, which application channels perform best, interview-round progression, and offer figures. Use this for questions like \"how is my search going?\" — it returns compact summaries rather than raw records.",
        ),
        write(
            "create_application",
            "Create a new job application.",
            json!({
                "type": "object",
                "properties": {
                    "company": { "type": "string", "description": "Company name" },
                    "role": { "type": "string", "description": "Job title / role" },
                    "status": {
                        "type": "string",
                        "description": "Initial status (draft, applied, interviewing, offer, rejected)",
                    },
                    "jobUrl": { "type": "string", "description": "Link to the job posting" },
                    "location": { "type": "string" },
                    "salaryRange": { "type": "string" },
                    "description": { "type": "string", "description": "Job description or notes" },
                    "source": { "type": "string", "description": "Where the role was found, e.g. LinkedIn" },
                },
                "required": ["company", "role"],
            }),
        ),
        write(
            "update_application",
            "Update fields on an existing job application. Only the fields provided are changed.",
            json!({
                "type": "object",
                "properties": {
                    "applicationId": { "type": "string", "description": "The application ID" },
                    "company": { "type": "string" },
                    "role": { "type": "string" },
                    "status": {
                        "type": "string",
                        "description": "New status (draft, applied, interviewing, offer, rejected)",
                    },
                    "jobUrl": { "type": "string" },
                    "location": { "type": "string" },
                    "salaryRange": { "type": "string" },
                    "description": { "type": "string" },
                    "source": { "type": "string" },
                },
                "required": ["applicationId"],
            }),
        ),
        write(
            "create_note",
            "Add a note to a job application.",
            json!({
                "type": "object",
                "properties": {
                    "applicationId": { "type": "string", "description": "The application ID" },
                    "content": { "type": "string", "description": "Note text" },
                },
                "required": ["applicationId", "content"],
            }),
        ),
        write(
            "create_interview_round",
            "Record an interview round for a job application.",
            json!({
                "type": "object",
                "properties": {
                    "applicationId": { "type": "string", "description": "The application ID" },
                    "type": {
                        "type": "string",
                        "description": "Round type, e.g. phone_screen, technical, onsite, final",
                    },
                    "scheduledAt": { "type": "string", "description": "ISO 8601 date-time the round is scheduled" },
                    "interviewerName": { "type": "string" },
                    "notes": { "type": "string" },
                },
                "required": ["applicationId"],
            }),
        ),
        write(
            "create_skill",
            "Add a skill to the user profile.",
            json!({
                "type": "object",
                "properties": {
                    "name": { "type": "string", "description": "Skill name, e.g. TypeScript" },
                    "category": { "type": "string", "description": "Grouping, e.g. Languages" },
                    "proficiency": { "type": "string", "description": "e.g. beginner, intermediate, expert" },
                },
                "required": ["name"],
            }),
        ),
        write(
            "update_skill",
            "Update an existing skill. Only the fields provided are changed.",
            json!({
                "type": "object",
                "properties": {
                    "skillId": { "type": "string", "description": "The skill ID (from list_skills)" },
                    "name": { "type": "string" },
                    "category": { "type": "string" },
                    "proficiency": { "type": "string" },
                },
                "required": ["skillId"],
            }),
        ),
        write(
            "create_education",
            "Add an education entry to the user profile.",
            json!({
                "type": "object",
                "properties": {
                    "institution": { "type": "string", "description": "School or university name" },
                    "startDate": { "type": "string", "description": "ISO 8601 date the study began (required)" },
                    "degree": { "type": "string" },
                    "field": { "type": "string", "description": "Field of study" },
                    "endDate": { "type": "string", "description": "ISO 8601 date; omit if ongoing" },
                    "description": { "type": "string" },
                },
                "required": ["institution", "startDate"],
            }),
        ),
        write(
            "update_education",
            "Update an existing education entry. Only the fields provided are changed.",
            json!({
                "type": "object",
                "properties": {
                    "educationId": { "type": "string", "description": "The education ID (from list_educations)" },
                    "institution": { "type": "string" },
                    "degree": { "type": "string" },
                    "field": { "type": "string" },
                    "startDate": { "type": "string", "description": "ISO 8601 date" },
                    "endDate": { "type": "string", "description": "ISO 8601 date" },
                    "description": { "type": "string" },
                },
                "required": ["educationId"],
            }),
        ),
        write(
            "create_work_experience",
            "Add a work experience entry to the user profile.",
            json!({
                "type": "object",
                "properties": {
                    "company": { "type": "string" },
                    "title": { "type": "string", "description": "Job title" },
                    "startDate": { "type": "string", "description": "ISO 8601 date the role began (required)" },
                    "location": { "type": "string" },
                    "endDate": { "type": "string", "description": "ISO 8601 date; omit if current" },
                    "description": { "type": "string" },
                },
                "required": ["company", "title", "startDate"],
            }),
        ),
        write(
            "update_work_experience",
            "Update an existing work experience entry. Only the fields provided are changed.",
            json!({
                "type": "object",
                "properties": {
                    "workExperienceId": {
                        "type": "string",
                        "description": "The work experience ID (from list_work_experiences)",
                    },
                    "company": { "type": "string" },
                    "title": { "type": "string" },
                    "location": { "type": "string" },
                    "startDate": { "type": "string", "description": "ISO 8601 date" },
                    "endDate": { "type": "string", "description": "ISO 8601 date" },
                    "description": { "type": "string" },
                },
                "required": ["workExperienceId"],
            }),
        ),
    ]
}

/// Every tool, read and write.
pub fn tool_catalogue() -> &'static [ToolDefinition] {
    static CATALOGUE: OnceLock<Vec<ToolDefinition>> = OnceLock::new();
    CATALOGUE.get_or_init(build)
}

/// What the MCP server exposes: everything. Write tools are gated per request
/// by token scope rather than withheld from the catalogue, so a full-access
/// token sees them and a read-only one does not.
pub fn mcp_tools() -> &'static [ToolDefinition] {
    tool_catalogue()
}

/// What the in-app chat assistant exposes: reads only. Chat is
/// session-authenticated and has no token scope to gate on, so it cannot
/// safely offer write tools — a user talking to the assistant has not opted
/// into letting it mutate their data the way someone minting a full-access
/// token has.
pub fn chat_tools() -> Vec<&'static ToolDefinition> {
    tool_catalogue().iter().filter(|tool| tool.access == ToolAccess::Read).collect()
}

/// Adapts catalogue entries to the shape an LLM provider expects, dropping
/// the internal `access` tag on the way out.
///
/// The cache breakpoint goes on the final tool so providers that support
/// prompt caching can reuse the whole tools block across turns; it belongs
/// here rather than in the catalogue because it is a provider concern.
pub fn to_llm_tool_definitions(tools: &[&ToolDefinition]) -> Vec<LlmToolDefinition> {
    tools
        .iter()
        .enumerate()
        .map(|(index, tool)| {
            let definition = LlmToolDefinition::new(
                tool.name,
                tool.description.clone(),
                tool.input_schema.clone(),
            );
            if index + 1 == tools.len() {
                definition.with_cache_breakpoint()
            } else {
                definition
            }
        })
        .collect()
}

/// The shape `tools/list` advertises: the `access` tag stripped.
pub fn advertise(tools: &[&ToolDefinition]) -> Vec<Value> {
    tools
        .iter()
        .map(|tool| {
            json!({
                "name": tool.name,
                "description": tool.description,
                "inputSchema": tool.input_schema,
            })
        })
        .collect()
}
