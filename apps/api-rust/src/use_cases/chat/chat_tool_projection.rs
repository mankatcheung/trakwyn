//! What a tool result looks like by the time the model reads it (T7).
//!
//! Domain entities are shaped for the database and the UI, not for a context
//! window: every nullable column is emitted as `"field":null`, every
//! timestamp as a 24-character ISO string with milliseconds, and a free-text
//! field can run to thousands of characters. Each of those is paid for on
//! every iteration of every turn. This pass drops nulls, shortens dates to
//! the precision that matters, and clips long strings.

use chrono::{DateTime, SecondsFormat, Utc};

use super::tool_entities;
use super::tool_json::ToolJson;
use crate::domain::application::Application;
use crate::use_cases::constants::chat;
use crate::use_cases::jobs::GetApplicationsPageOutput;
use crate::use_cases::shared::js_string::{utf16_len, utf16_prefix};

/// `compactForModel`. `None` is JavaScript's `undefined`: the caller drops
/// the key (or, inside an array, writes `null`).
pub fn compact_for_model(value: &ToolJson) -> Option<ToolJson> {
    match value {
        ToolJson::Null => None,
        ToolJson::Date(date) => Some(ToolJson::Str(format_date_for_model(*date))),
        ToolJson::Array(items) => Some(ToolJson::Array(
            items.iter().map(|item| compact_for_model(item).unwrap_or(ToolJson::Null)).collect(),
        )),
        ToolJson::Str(text) => {
            Some(ToolJson::Str(clip_for_model(text, chat::TOOL_RESULT_STRING_MAX_CHARS)))
        }
        ToolJson::Object(fields) => Some(ToolJson::Object(
            fields
                .iter()
                .filter_map(|(key, entry)| compact_for_model(entry).map(|c| (key.clone(), c)))
                .collect(),
        )),
        other => Some(other.clone()),
    }
}

/// `2026-09-06` for a date, `2026-09-06T14:30Z` for a moment. Milliseconds
/// and seconds never matter to a question about a job search, and each costs
/// the model tokens for every row that carries a timestamp.
pub fn format_date_for_model(date: DateTime<Utc>) -> String {
    let iso = date.to_rfc3339_opts(SecondsFormat::Millis, true);
    if iso.ends_with("T00:00:00.000Z") {
        iso[..10].to_string()
    } else {
        format!("{}Z", &iso[..16])
    }
}

/// `String.prototype.trimEnd`.
pub fn js_trim_end(text: &str) -> &str {
    text.trim_end_matches(|c: char| (c.is_whitespace() && c != '\u{85}') || c == '\u{feff}')
}

pub fn clip_for_model(text: &str, max_chars: usize) -> String {
    if utf16_len(text) > max_chars {
        format!("{}…", js_trim_end(utf16_prefix(text, max_chars)))
    } else {
        text.to_string()
    }
}

/// The `Application` columns the assistant can do something with (T1): lists
/// get a preview of the description, `get_application` a bounded full text,
/// and workflow columns the model never reasons about are left out.
pub fn project_application_summary(app: &Application) -> ToolJson {
    let mut fields = vec![
        ("id", ToolJson::str(&app.id)),
        ("company", ToolJson::str(&app.company)),
        ("role", ToolJson::str(&app.role)),
        ("status", ToolJson::str(app.status.as_str())),
        ("location", ToolJson::opt_str(&app.location)),
        ("source", ToolJson::opt_str(&app.source)),
    ];
    // `undefined` in the original when false / empty / missing.
    if app.starred {
        fields.push(("starred", ToolJson::Bool(true)));
    }
    if !app.tags.is_empty() {
        fields.push(("tags", ToolJson::array(app.tags.iter().map(ToolJson::str))));
    }
    fields.push(("appliedAt", ToolJson::opt_date(&app.applied_at)));
    fields.push(("followUpAt", ToolJson::opt_date(&app.follow_up_at)));
    if let Some(description) = app.description.as_deref().filter(|d| !d.is_empty()) {
        fields.push((
            "description",
            ToolJson::Str(clip_for_model(description, chat::LIST_DESCRIPTION_MAX_CHARS)),
        ));
    }
    ToolJson::object(fields)
}

pub fn project_application_detail(app: &Application) -> ToolJson {
    let ToolJson::Object(mut fields) = project_application_summary(app) else {
        return ToolJson::Null;
    };
    set(&mut fields, "jobUrl", ToolJson::opt_str(&app.job_url));
    set(&mut fields, "salaryRange", ToolJson::opt_str(&app.salary_range));
    set(&mut fields, "createdAt", ToolJson::Date(app.created_at));
    // Spread then override: a present key keeps its position, a new one is last.
    match app.description.as_deref().filter(|d| !d.is_empty()) {
        Some(description) => set(
            &mut fields,
            "description",
            ToolJson::Str(clip_for_model(description, chat::DETAIL_DESCRIPTION_MAX_CHARS)),
        ),
        None => fields.retain(|(key, _)| key != "description"),
    }
    ToolJson::Object(fields)
}

fn set(fields: &mut Vec<(String, ToolJson)>, key: &str, value: ToolJson) {
    match fields.iter_mut().find(|(existing, _)| existing == key) {
        Some(slot) => slot.1 = value,
        None => fields.push((key.to_string(), value)),
    }
}

/// A page of applications as `{items, nextCursor, hasNextPage}`, rows
/// projected by `project_row`.
pub fn page_json(
    page: &GetApplicationsPageOutput,
    project_row: fn(&Application) -> ToolJson,
) -> ToolJson {
    ToolJson::object(vec![
        ("items", ToolJson::array(page.items.iter().map(project_row))),
        ("nextCursor", page.next_cursor.as_ref().map_or(ToolJson::Null, ToolJson::str)),
        ("hasNextPage", ToolJson::Bool(page.has_next_page)),
    ])
}

/// The unprojected entity JSON, for tools that pass through.
pub fn full_application(app: &Application) -> ToolJson {
    tool_entities::application(app)
}
