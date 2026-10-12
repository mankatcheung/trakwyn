use std::sync::Arc;

use chrono::{DateTime, TimeDelta, Utc};

use crate::domain::application::ApplicationStatus;
use crate::domain::interview_round::InterviewRoundOutcome;
use crate::use_cases::clock::now;
use crate::use_cases::constants::durations_ms;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{
    ApplicationRepository, FindApplicationsFilters, InterviewRoundRepository, ShareLinkRepository,
};
use crate::use_cases::secret_token;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StatusCount {
    pub status: ApplicationStatus,
    pub count: usize,
}

/// What a share link shows: aggregates only, never a per-application field.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SharedSummary {
    /// One entry per status, in `ApplicationStatus::ALL` order, zeros included.
    pub status_counts: Vec<StatusCount>,
    pub total_applications: usize,
    pub total_interviews: usize,
    pub upcoming_interviews: usize,
    pub applications_updated_last_7_days: usize,
    pub generated_at: DateTime<Utc>,
}

pub struct GetSharedSummaryUseCase {
    pub share_link_repository: Arc<dyn ShareLinkRepository>,
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub interview_round_repository: Arc<dyn InterviewRoundRepository>,
}

impl GetSharedSummaryUseCase {
    /// `None` when no link has this token. A hit records the use.
    pub async fn execute(&self, raw_token: &str) -> DomainResult<Option<SharedSummary>> {
        let token_hash = secret_token::hash(raw_token);
        let Some(link) = self.share_link_repository.find_by_token_hash(&token_hash).await? else {
            return Ok(None);
        };

        self.share_link_repository.update_last_used(&link.id).await?;

        let applications = self
            .application_repository
            .find_all_by_user_id(&link.user_id, FindApplicationsFilters::default())
            .await?;
        let interview_rounds =
            self.interview_round_repository.find_all_by_user_id(&link.user_id).await?;

        let status_counts = ApplicationStatus::ALL
            .into_iter()
            .map(|status| StatusCount {
                status,
                count: applications.iter().filter(|a| a.status == status).count(),
            })
            .collect();

        let now = now();
        let seven_days_ago = now - TimeDelta::milliseconds(durations_ms::WEEK);
        let applications_updated_last_7_days =
            applications.iter().filter(|a| a.updated_at >= seven_days_ago).count();
        let upcoming_interviews = interview_rounds
            .iter()
            .filter(|round| {
                round.outcome == InterviewRoundOutcome::Pending
                    && round.scheduled_at.is_some_and(|scheduled_at| scheduled_at > now)
            })
            .count();

        Ok(Some(SharedSummary {
            status_counts,
            total_applications: applications.len(),
            total_interviews: interview_rounds.len(),
            upcoming_interviews,
            applications_updated_last_7_days,
            generated_at: now,
        }))
    }
}
