use async_trait::async_trait;
use chrono::{DateTime, Utc};

use crate::domain::interview_round::{InterviewRound, InterviewRoundOutcome, InterviewRoundType};
use crate::use_cases::errors::DomainResult;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateInterviewRoundData {
    pub id: String,
    pub application_id: String,
    pub r#type: InterviewRoundType,
    pub scheduled_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub interviewer_name: Option<String>,
    pub notes: Option<String>,
    /// `None` stores `defaults::INTERVIEW_OUTCOME`.
    pub outcome: Option<InterviewRoundOutcome>,
}

/// A field left `None` is not written. For a nullable column, `Some(None)`
/// writes null.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct UpdateInterviewRoundData {
    pub r#type: Option<InterviewRoundType>,
    pub scheduled_at: Option<Option<DateTime<Utc>>>,
    pub completed_at: Option<Option<DateTime<Utc>>>,
    pub interviewer_name: Option<Option<String>>,
    pub notes: Option<Option<String>>,
    pub outcome: Option<InterviewRoundOutcome>,
}

#[async_trait]
pub trait InterviewRoundRepository: Send + Sync {
    /// Oldest first.
    async fn find_all_by_application_id(
        &self,
        application_id: &str,
    ) -> DomainResult<Vec<InterviewRound>>;
    async fn count_by_application_id(&self, application_id: &str) -> DomainResult<i64>;
    /// Across every application owned by the user, for the calendar view.
    async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<InterviewRound>>;
    async fn find_by_id(&self, id: &str) -> DomainResult<Option<InterviewRound>>;
    /// Rounds scheduled within `window_ms` from now that are not completed
    /// and have had no push notification, soonest first.
    async fn find_upcoming_within_window(
        &self,
        window_ms: i64,
    ) -> DomainResult<Vec<InterviewRound>>;
    async fn create(&self, data: CreateInterviewRoundData) -> DomainResult<InterviewRound>;
    async fn update(
        &self,
        id: &str,
        data: UpdateInterviewRoundData,
    ) -> DomainResult<InterviewRound>;
    async fn update_push_notification_sent_at(
        &self,
        id: &str,
        sent_at: DateTime<Utc>,
    ) -> DomainResult<()>;
    /// `application_id` is the round's owner, passed so a caching decorator
    /// can invalidate that application's list without a lookup.
    async fn delete(&self, id: &str, application_id: &str) -> DomainResult<()>;
}
