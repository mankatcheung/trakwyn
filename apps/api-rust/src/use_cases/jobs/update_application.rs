use std::sync::Arc;

use chrono::{DateTime, Utc};
use serde_json::json;

use crate::domain::activity_log::ActivityEventType;
use crate::domain::application::{Application, ApplicationStatus};
use crate::use_cases::clock::now;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::transaction_manager::{in_transaction, TransactionManager};
use crate::use_cases::ports::{
    ActivityLogRepository, AppendActivityLogData, ApplicationRepository, ApplicationTagData,
    UpdateApplicationData,
};

/// A field left `None` is not changed. For a nullable field, `Some(None)`
/// clears it.
#[derive(Debug, Clone, Default)]
pub struct UpdateApplicationInput {
    pub user_id: String,
    pub application_id: String,
    pub company: Option<String>,
    pub role: Option<String>,
    pub status: Option<ApplicationStatus>,
    pub job_url: Option<Option<String>>,
    pub location: Option<Option<String>>,
    pub salary_range: Option<Option<String>>,
    pub description: Option<Option<String>>,
    pub starred: Option<bool>,
    pub source: Option<Option<String>>,
    pub follow_up_at: Option<Option<DateTime<Utc>>>,
    pub tags: Option<Vec<String>>,
}

pub struct UpdateApplicationUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub activity_log_repository: Arc<dyn ActivityLogRepository>,
    pub generate_id: GenerateId,
    pub transaction_manager: Arc<dyn TransactionManager>,
}

/// The fields whose value the input would actually change, by their GraphQL
/// names, in the order the activity feed lists them.
fn changed_fields(input: &UpdateApplicationInput, current: &Application) -> Vec<&'static str> {
    let differs = |next: &Option<String>, current: &String| {
        next.as_ref().is_some_and(|value| value != current)
    };
    let nullable_differs = |next: &Option<Option<String>>, current: &Option<String>| {
        next.as_ref().is_some_and(|value| value != current)
    };

    let mut changed = Vec::new();
    if differs(&input.company, &current.company) {
        changed.push("company");
    }
    if differs(&input.role, &current.role) {
        changed.push("role");
    }
    if nullable_differs(&input.job_url, &current.job_url) {
        changed.push("jobUrl");
    }
    if nullable_differs(&input.location, &current.location) {
        changed.push("location");
    }
    if nullable_differs(&input.salary_range, &current.salary_range) {
        changed.push("salaryRange");
    }
    if nullable_differs(&input.description, &current.description) {
        changed.push("description");
    }
    if nullable_differs(&input.source, &current.source) {
        changed.push("source");
    }
    if input.starred.is_some_and(|starred| starred != current.starred) {
        changed.push("starred");
    }
    // Compared as instants, so the same moment written differently is no change.
    if input.follow_up_at.is_some_and(|follow_up_at| follow_up_at != current.follow_up_at) {
        changed.push("followUpAt");
    }
    changed
}

impl UpdateApplicationUseCase {
    pub async fn execute(&self, input: UpdateApplicationInput) -> DomainResult<Application> {
        let current = self
            .application_repository
            .find_by_id(&input.application_id)
            .await?
            .ok_or_else(|| DomainError::not_found("Application not found"))?;
        if current.user_id != input.user_id {
            return Err(DomainError::forbidden("Forbidden"));
        }

        let applied_at = (input.status == Some(ApplicationStatus::Applied)
            && current.applied_at.is_none())
        .then(|| Some(now()));

        // A card that changes column keeps whatever rank it held in the old
        // one, which would drop it at an arbitrary depth in the new column.
        // Resetting to 0 puts it on top, matching where a newly created
        // application lands. A board drag sets the real index straight after
        // this, so the 0 only survives for status changes made somewhere else.
        let new_status = input.status.filter(|status| *status != current.status);

        let tags = input.tags.as_ref().map(|names| {
            names
                .iter()
                .map(|name| ApplicationTagData { id: (self.generate_id)(), name: name.clone() })
                .collect::<Vec<_>>()
        });

        in_transaction(self.transaction_manager.as_ref(), async {
            let updated = self
                .application_repository
                .update(
                    &input.application_id,
                    UpdateApplicationData {
                        company: input.company.clone(),
                        role: input.role.clone(),
                        status: input.status,
                        job_url: input.job_url.clone(),
                        location: input.location.clone(),
                        salary_range: input.salary_range.clone(),
                        description: input.description.clone(),
                        applied_at,
                        starred: input.starred,
                        source: input.source.clone(),
                        follow_up_at: input.follow_up_at,
                        tags,
                        board_position: new_status.map(|_| 0),
                    },
                )
                .await?;

            let entry = match new_status {
                Some(to) => Some((
                    ActivityEventType::StatusChanged,
                    json!({ "from": current.status.as_str(), "to": to.as_str() }),
                )),
                None => {
                    let changed = changed_fields(&input, &current);
                    (!changed.is_empty())
                        .then(|| (ActivityEventType::FieldUpdated, json!({ "fields": changed })))
                }
            };
            if let Some((event_type, payload)) = entry {
                self.activity_log_repository
                    .append(AppendActivityLogData {
                        id: (self.generate_id)(),
                        application_id: input.application_id.clone(),
                        actor_id: input.user_id.clone(),
                        event_type,
                        payload: payload.to_string(),
                    })
                    .await?;
            }

            Ok(updated)
        })
        .await
    }
}
