use std::collections::HashMap;
use std::sync::Arc;

use crate::domain::application::ApplicationStatus;
use crate::domain::interview_round::{InterviewRoundOutcome, InterviewRoundType};
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{
    ApplicationRepository, FindApplicationsFilters, InterviewRoundRepository,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InterviewRoundTypeStat {
    pub r#type: InterviewRoundType,
    pub passed: i32,
    pub failed: i32,
    pub pending: i32,
    pub cancelled: i32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RoundsToTerminalStat {
    pub average: Option<f64>,
    pub median: Option<f64>,
    pub sample_size: i32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct InterviewRoundAnalytics {
    pub by_type: Vec<InterviewRoundTypeStat>,
    pub rounds_to_offer: RoundsToTerminalStat,
    pub rounds_to_rejection: RoundsToTerminalStat,
}

pub struct GetInterviewRoundAnalyticsInput {
    pub user_id: String,
}

fn average(counts: &[i32]) -> Option<f64> {
    if counts.is_empty() {
        return None;
    }
    let sum: f64 = counts.iter().map(|count| f64::from(*count)).sum();
    Some(sum / counts.len() as f64)
}

fn median(counts: &[i32]) -> Option<f64> {
    if counts.is_empty() {
        return None;
    }
    let mut sorted = counts.to_vec();
    sorted.sort_unstable();
    let mid = sorted.len() / 2;
    Some(if sorted.len().is_multiple_of(2) {
        (f64::from(sorted[mid - 1]) + f64::from(sorted[mid])) / 2.0
    } else {
        f64::from(sorted[mid])
    })
}

fn to_stat(counts: &[i32]) -> RoundsToTerminalStat {
    RoundsToTerminalStat {
        average: average(counts),
        median: median(counts),
        sample_size: counts.len() as i32,
    }
}

/// How a user's interviews went: outcome counts per round type, and how many
/// rounds an application goes through before an offer or a rejection.
///
/// `withdrawn` applications are left out of the rounds-to-terminal-state
/// figures: they are neither a pass nor a fail, so their round count belongs
/// in neither bucket.
pub struct GetInterviewRoundAnalyticsUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub interview_round_repository: Arc<dyn InterviewRoundRepository>,
}

impl GetInterviewRoundAnalyticsUseCase {
    pub async fn execute(
        &self,
        input: GetInterviewRoundAnalyticsInput,
    ) -> DomainResult<InterviewRoundAnalytics> {
        let applications = self
            .application_repository
            .find_all_by_user_id(&input.user_id, FindApplicationsFilters::default())
            .await?;
        let rounds = self.interview_round_repository.find_all_by_user_id(&input.user_id).await?;

        let by_type = InterviewRoundType::ALL
            .into_iter()
            .map(|round_type| {
                let count = |outcome: InterviewRoundOutcome| {
                    rounds
                        .iter()
                        .filter(|round| round.r#type == round_type && round.outcome == outcome)
                        .count() as i32
                };
                InterviewRoundTypeStat {
                    r#type: round_type,
                    passed: count(InterviewRoundOutcome::Passed),
                    failed: count(InterviewRoundOutcome::Failed),
                    pending: count(InterviewRoundOutcome::Pending),
                    cancelled: count(InterviewRoundOutcome::Cancelled),
                }
            })
            .filter(|stat| stat.passed + stat.failed + stat.pending + stat.cancelled > 0)
            .collect();

        let mut round_count_by_application_id: HashMap<&str, i32> = HashMap::new();
        for round in &rounds {
            *round_count_by_application_id.entry(round.application_id.as_str()).or_insert(0) += 1;
        }

        let mut offer_round_counts = Vec::new();
        let mut rejection_round_counts = Vec::new();
        for application in &applications {
            let Some(count) = round_count_by_application_id.get(application.id.as_str()) else {
                continue;
            };
            match application.status {
                ApplicationStatus::Offered | ApplicationStatus::Accepted => {
                    offer_round_counts.push(*count);
                }
                ApplicationStatus::Rejected => rejection_round_counts.push(*count),
                _ => {}
            }
        }

        Ok(InterviewRoundAnalytics {
            by_type,
            rounds_to_offer: to_stat(&offer_round_counts),
            rounds_to_rejection: to_stat(&rejection_round_counts),
        })
    }
}
