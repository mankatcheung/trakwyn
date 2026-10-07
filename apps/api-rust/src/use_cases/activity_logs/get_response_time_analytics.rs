use std::collections::HashMap;
use std::sync::Arc;

use chrono::{DateTime, Utc};

use crate::domain::activity_log::ActivityEventType;
use crate::domain::application::ApplicationStatus;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{
    ActivityLogRepository, ApplicationRepository, FindApplicationsFilters,
};

#[derive(Debug, Clone, PartialEq)]
pub struct StageDurationStat {
    pub status: ApplicationStatus,
    pub average_days: Option<f64>,
    pub median_days: Option<f64>,
    pub sample_size: usize,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TimeToResponseStat {
    pub average_days: Option<f64>,
    pub median_days: Option<f64>,
    pub sample_size: usize,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ResponseTimeAnalytics {
    pub time_in_stage: Vec<StageDurationStat>,
    pub time_to_first_response: TimeToResponseStat,
}

pub struct GetResponseTimeAnalyticsInput {
    pub user_id: String,
}

const MS_PER_DAY: f64 = 1000.0 * 60.0 * 60.0 * 24.0;

struct StatusChange {
    from: ApplicationStatus,
    created_at: DateTime<Utc>,
}

fn average(days: &[f64]) -> Option<f64> {
    if days.is_empty() {
        return None;
    }
    Some(days.iter().sum::<f64>() / days.len() as f64)
}

fn median(days: &[f64]) -> Option<f64> {
    if days.is_empty() {
        return None;
    }
    let mut sorted = days.to_vec();
    sorted.sort_by(f64::total_cmp);
    let mid = sorted.len() / 2;
    Some(if sorted.len().is_multiple_of(2) {
        (sorted[mid - 1] + sorted[mid]) / 2.0
    } else {
        sorted[mid]
    })
}

fn days_between(start: DateTime<Utc>, end: DateTime<Utc>) -> f64 {
    (end - start).num_milliseconds() as f64 / MS_PER_DAY
}

/// The stage a `status_changed` entry left, or `None` for a payload that is
/// not `{ "from": <status>, "to": <status> }`.
fn parse_status_change_from(payload: &str) -> Option<ApplicationStatus> {
    let parsed: serde_json::Value = serde_json::from_str(payload).ok()?;
    let from = ApplicationStatus::parse(parsed.get("from")?.as_str()?)?;
    ApplicationStatus::parse(parsed.get("to")?.as_str()?)?;
    Some(from)
}

/// ActivityLog records a timestamped `status_changed` event on every stage
/// transition. This turns that history into two metrics: how long
/// applications typically sit in each stage before moving on, and how long it
/// takes to hear back after applying.
///
/// A stage's duration is only counted once an application has actually left
/// it: an application still sitting in its current stage contributes no data
/// point for that stage, since we don't know when (or whether) it will exit.
///
/// Time-to-first-response is measured from `appliedAt` to the status_changed
/// event whose `from` is `applied` (the moment the application actually
/// moved) rather than simply the next log entry after `appliedAt`, since an
/// application can accumulate unrelated activity before its status moves.
pub struct GetResponseTimeAnalyticsUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub activity_log_repository: Arc<dyn ActivityLogRepository>,
}

impl GetResponseTimeAnalyticsUseCase {
    pub async fn execute(
        &self,
        input: GetResponseTimeAnalyticsInput,
    ) -> DomainResult<ResponseTimeAnalytics> {
        let (applications, logs) = tokio::try_join!(
            self.application_repository
                .find_all_by_user_id(&input.user_id, FindApplicationsFilters::default()),
            self.activity_log_repository.find_all_by_user_id(&input.user_id),
        )?;

        let mut changes_by_application: HashMap<String, Vec<StatusChange>> = HashMap::new();
        for log in logs {
            if log.event_type != ActivityEventType::StatusChanged {
                continue;
            }
            let Some(from) = parse_status_change_from(&log.payload) else { continue };
            changes_by_application
                .entry(log.application_id)
                .or_default()
                .push(StatusChange { from, created_at: log.created_at });
        }
        for changes in changes_by_application.values_mut() {
            changes.sort_by_key(|change| change.created_at);
        }

        // Stages in first-seen order, so equally sampled stages keep it.
        let mut days_by_status: Vec<(ApplicationStatus, Vec<f64>)> = Vec::new();
        let mut time_to_first_response_days = Vec::new();

        for application in &applications {
            let changes =
                changes_by_application.get(&application.id).map(Vec::as_slice).unwrap_or_default();

            let mut segment_start = application.created_at;
            for change in changes {
                let days = days_between(segment_start, change.created_at);
                match days_by_status.iter_mut().find(|(status, _)| *status == change.from) {
                    Some((_, list)) => list.push(days),
                    None => days_by_status.push((change.from, vec![days])),
                }
                segment_start = change.created_at;
            }

            if let Some(applied_at) = application.applied_at {
                let exit_from_applied =
                    changes.iter().find(|change| change.from == ApplicationStatus::Applied);
                if let Some(exit) = exit_from_applied {
                    time_to_first_response_days.push(days_between(applied_at, exit.created_at));
                }
            }
        }

        let mut time_in_stage: Vec<StageDurationStat> = days_by_status
            .iter()
            .map(|(status, days)| StageDurationStat {
                status: *status,
                average_days: average(days),
                median_days: median(days),
                sample_size: days.len(),
            })
            .collect();
        time_in_stage.sort_by_key(|stat| std::cmp::Reverse(stat.sample_size));

        Ok(ResponseTimeAnalytics {
            time_in_stage,
            time_to_first_response: TimeToResponseStat {
                average_days: average(&time_to_first_response_days),
                median_days: median(&time_to_first_response_days),
                sample_size: time_to_first_response_days.len(),
            },
        })
    }
}
