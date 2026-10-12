use std::sync::Arc;

use chrono::{DateTime, Utc};
use serde_json::Value;

use super::js_date::parse_js_date;
use super::js_string::js_trim;
use crate::domain::application::ApplicationStatus;
use crate::use_cases::constants::import_defaults;
use crate::use_cases::errors::{DomainError, DomainResult, ErrorCode};
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{
    ApplicationRepository, CreateApplicationData, CreateNoteData, NoteRepository,
    UpdateApplicationData,
};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ImportSummary {
    pub applications_imported: i32,
    pub applications_skipped: i32,
    pub notes_imported: i32,
    pub documents_skipped: i32,
}

fn as_nullable_string(value: Option<&Value>) -> Option<String> {
    value.and_then(Value::as_str).filter(|text| !text.is_empty()).map(str::to_string)
}

fn as_status(value: Option<&Value>) -> ApplicationStatus {
    value
        .and_then(Value::as_str)
        .and_then(ApplicationStatus::parse)
        .unwrap_or(import_defaults::APPLICATION_STATUS)
}

fn as_date(value: Option<&Value>) -> Option<DateTime<Utc>> {
    value.and_then(Value::as_str).and_then(parse_js_date)
}

/// The company and role of an entry worth importing: both present, both
/// strings, neither blank.
fn company_and_role(entry: &Value) -> Option<(&str, &str)> {
    let company = entry.get("company")?.as_str()?;
    let role = entry.get("role")?.as_str()?;
    (!js_trim(company).is_empty() && !js_trim(role).is_empty()).then_some((company, role))
}

fn saturating_len(items: &[Value]) -> i32 {
    i32::try_from(items.len()).unwrap_or(i32::MAX)
}

pub struct ImportUserDataUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub note_repository: Arc<dyn NoteRepository>,
    pub generate_id: GenerateId,
}

impl ImportUserDataUseCase {
    /// Reads a document `exportUserData` produced and recreates its
    /// applications and notes for `user_id`. Entries that cannot be imported
    /// are counted, not fatal.
    pub async fn execute(&self, user_id: &str, raw_data: &str) -> DomainResult<ImportSummary> {
        let parsed: Value = serde_json::from_str(raw_data)
            .map_err(|_| DomainError::validation("Import file is not valid JSON"))?;

        let Some(applications) = parsed.get("applications").and_then(Value::as_array) else {
            return Err(DomainError::validation(
                "Import file must contain an \"applications\" array — export your data first",
            ));
        };

        let mut summary = ImportSummary::default();

        for entry in applications {
            let Some((company, role)) = company_and_role(entry) else {
                summary.applications_skipped += 1;
                continue;
            };

            let created = self
                .application_repository
                .create(CreateApplicationData {
                    id: (self.generate_id)(),
                    user_id: user_id.to_string(),
                    company: company.to_string(),
                    role: role.to_string(),
                    status: as_status(entry.get("status")),
                    job_url: as_nullable_string(entry.get("jobUrl")),
                    location: as_nullable_string(entry.get("location")),
                    salary_range: as_nullable_string(entry.get("salaryRange")),
                    description: as_nullable_string(entry.get("description")),
                    starred: None,
                    source: None,
                    follow_up_at: None,
                    tags: Vec::new(),
                })
                .await;
            let app = match created {
                Ok(app) => app,
                // Over the application quota: this one is left out, and the
                // rest of the file is still tried.
                Err(err) if err.code() == ErrorCode::QuotaExceeded => {
                    summary.applications_skipped += 1;
                    continue;
                }
                Err(err) => return Err(err),
            };

            if let Some(applied_at) = as_date(entry.get("appliedAt")) {
                self.application_repository
                    .update(
                        &app.id,
                        UpdateApplicationData {
                            applied_at: Some(Some(applied_at)),
                            ..UpdateApplicationData::default()
                        },
                    )
                    .await?;
            }

            summary.applications_imported += 1;

            if let Some(notes) = entry.get("notes").and_then(Value::as_array) {
                for note in notes {
                    let content = note.get("content").and_then(Value::as_str);
                    let Some(content) = content.filter(|text| !js_trim(text).is_empty()) else {
                        continue;
                    };
                    self.note_repository
                        .create(CreateNoteData {
                            id: (self.generate_id)(),
                            application_id: app.id.clone(),
                            content: content.to_string(),
                        })
                        .await?;
                    summary.notes_imported += 1;
                }
            }

            if let Some(documents) = entry.get("documents").and_then(Value::as_array) {
                // Exported document metadata has no storage key: there is no
                // file content to restore, so the count of what was left out
                // is reported rather than recreating records that point at
                // nothing.
                summary.documents_skipped =
                    summary.documents_skipped.saturating_add(saturating_len(documents));
            }
        }

        Ok(summary)
    }
}
