use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use chrono::{DateTime, TimeDelta, Utc};

use super::FakeApplicationRepository;
use crate::domain::interview_round::InterviewRound;
use crate::use_cases::clock::now;
use crate::use_cases::constants::defaults;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{
    CreateInterviewRoundData, InterviewRoundRepository, UpdateInterviewRoundData,
};

/// `find_all_by_user_id` joins to the applications fake given to
/// [`FakeInterviewRoundRepository::with_applications`]; without one, no round
/// has an owner and it finds nothing.
#[derive(Default)]
pub struct FakeInterviewRoundRepository {
    rounds: Mutex<Vec<InterviewRound>>,
    applications: Option<Arc<FakeApplicationRepository>>,
}

impl FakeInterviewRoundRepository {
    pub fn with(rounds: Vec<InterviewRound>) -> Self {
        Self { rounds: Mutex::new(rounds), applications: None }
    }

    pub fn with_applications(mut self, applications: Arc<FakeApplicationRepository>) -> Self {
        self.applications = Some(applications);
        self
    }

    pub fn all(&self) -> Vec<InterviewRound> {
        self.rounds.lock().unwrap().clone()
    }

    fn matching(&self, keep: impl Fn(&InterviewRound) -> bool) -> Vec<InterviewRound> {
        self.all().into_iter().filter(|round| keep(round)).collect()
    }
}

#[async_trait]
impl InterviewRoundRepository for FakeInterviewRoundRepository {
    async fn find_all_by_application_id(
        &self,
        application_id: &str,
    ) -> DomainResult<Vec<InterviewRound>> {
        let mut rounds = self.matching(|round| round.application_id == application_id);
        rounds.sort_by_key(|round| round.created_at);
        Ok(rounds)
    }

    async fn count_by_application_id(&self, application_id: &str) -> DomainResult<i64> {
        Ok(self.find_all_by_application_id(application_id).await?.len() as i64)
    }

    async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<InterviewRound>> {
        // Trashed applications are not filtered out, as in the query.
        let applications = self.applications.as_ref().map(|a| a.all()).unwrap_or_default();
        let mut rounds = self.matching(|round| {
            applications.iter().any(|a| a.id == round.application_id && a.user_id == user_id)
        });
        rounds.sort_by_key(|round| round.created_at);
        Ok(rounds)
    }

    async fn find_by_id(&self, id: &str) -> DomainResult<Option<InterviewRound>> {
        Ok(self.matching(|round| round.id == id).pop())
    }

    async fn find_upcoming_within_window(
        &self,
        window_ms: i64,
    ) -> DomainResult<Vec<InterviewRound>> {
        let now = now();
        let cutoff = now + TimeDelta::milliseconds(window_ms);
        let mut rounds = self.matching(|round| {
            round.scheduled_at.is_some_and(|at| at > now && at <= cutoff)
                && round.completed_at.is_none()
                && round.push_notification_sent_at.is_none()
        });
        rounds.sort_by_key(|round| round.scheduled_at);
        Ok(rounds)
    }

    async fn create(&self, data: CreateInterviewRoundData) -> DomainResult<InterviewRound> {
        let timestamp = now();
        let round = InterviewRound {
            id: data.id,
            application_id: data.application_id,
            r#type: data.r#type,
            scheduled_at: data.scheduled_at,
            completed_at: data.completed_at,
            interviewer_name: data.interviewer_name,
            notes: data.notes,
            outcome: data.outcome.unwrap_or(defaults::INTERVIEW_OUTCOME),
            push_notification_sent_at: None,
            created_at: timestamp,
            updated_at: timestamp,
        };
        self.rounds.lock().unwrap().push(round.clone());
        Ok(round)
    }

    async fn update(
        &self,
        id: &str,
        data: UpdateInterviewRoundData,
    ) -> DomainResult<InterviewRound> {
        let mut rounds = self.rounds.lock().unwrap();
        let round = rounds
            .iter_mut()
            .find(|round| round.id == id)
            .ok_or_else(|| DomainError::internal(format!("no interview round {id:?} to update")))?;

        if let Some(round_type) = data.r#type {
            round.r#type = round_type;
        }
        if let Some(scheduled_at) = data.scheduled_at {
            round.scheduled_at = scheduled_at;
        }
        if let Some(completed_at) = data.completed_at {
            round.completed_at = completed_at;
        }
        if let Some(interviewer_name) = data.interviewer_name {
            round.interviewer_name = interviewer_name;
        }
        if let Some(notes) = data.notes {
            round.notes = notes;
        }
        if let Some(outcome) = data.outcome {
            round.outcome = outcome;
        }
        round.updated_at = now();
        Ok(round.clone())
    }

    async fn update_push_notification_sent_at(
        &self,
        id: &str,
        sent_at: DateTime<Utc>,
    ) -> DomainResult<()> {
        let mut rounds = self.rounds.lock().unwrap();
        if let Some(round) = rounds.iter_mut().find(|round| round.id == id) {
            round.push_notification_sent_at = Some(sent_at);
            round.updated_at = now();
        }
        Ok(())
    }

    async fn delete(&self, id: &str, _application_id: &str) -> DomainResult<()> {
        self.rounds.lock().unwrap().retain(|round| round.id != id);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::interview_round::{InterviewRoundOutcome, InterviewRoundType};
    use crate::use_cases::test_support::application_owned_by;

    fn data(id: &str, application_id: &str) -> CreateInterviewRoundData {
        CreateInterviewRoundData {
            id: id.to_string(),
            application_id: application_id.to_string(),
            r#type: InterviewRoundType::Phone,
            scheduled_at: None,
            completed_at: None,
            interviewer_name: Some("Jane Doe".to_string()),
            notes: None,
            outcome: None,
        }
    }

    fn ids(rounds: &[InterviewRound]) -> Vec<&str> {
        rounds.iter().map(|round| round.id.as_str()).collect()
    }

    #[tokio::test]
    async fn create_defaults_the_outcome_and_update_writes_only_named_fields() {
        let repository = FakeInterviewRoundRepository::default();
        let created = repository.create(data("r1", "app-1")).await.unwrap();
        assert_eq!(created.outcome, InterviewRoundOutcome::Pending);

        let updated = repository
            .update(
                "r1",
                UpdateInterviewRoundData {
                    outcome: Some(InterviewRoundOutcome::Passed),
                    interviewer_name: Some(None),
                    ..Default::default()
                },
            )
            .await
            .unwrap();

        assert_eq!(updated.outcome, InterviewRoundOutcome::Passed);
        assert_eq!(updated.r#type, InterviewRoundType::Phone);
        assert_eq!(updated.interviewer_name, None);
    }

    #[tokio::test]
    async fn lists_a_users_rounds_through_the_applications_fake() {
        let applications = Arc::new(FakeApplicationRepository::with(vec![
            application_owned_by("app-1", "user-1"),
            application_owned_by("app-2", "user-2"),
        ]));
        let repository = FakeInterviewRoundRepository::default().with_applications(applications);
        repository.create(data("r1", "app-1")).await.unwrap();
        repository.create(data("r2", "app-2")).await.unwrap();

        assert_eq!(ids(&repository.find_all_by_user_id("user-1").await.unwrap()), vec!["r1"]);
        assert_eq!(repository.count_by_application_id("app-2").await.unwrap(), 1);
    }

    #[tokio::test]
    async fn upcoming_rounds_are_scheduled_inside_the_window_and_not_yet_notified() {
        let repository = FakeInterviewRoundRepository::default();
        let scheduled = |id: &str, offset: TimeDelta| CreateInterviewRoundData {
            scheduled_at: Some(now() + offset),
            ..data(id, "app-1")
        };
        repository.create(scheduled("later", TimeDelta::minutes(50))).await.unwrap();
        repository.create(scheduled("sooner", TimeDelta::minutes(10))).await.unwrap();
        repository.create(scheduled("notified", TimeDelta::minutes(20))).await.unwrap();
        repository.create(scheduled("outside", TimeDelta::minutes(90))).await.unwrap();
        repository.create(scheduled("past", TimeDelta::minutes(-5))).await.unwrap();
        repository.create(data("unscheduled", "app-1")).await.unwrap();
        repository
            .create(CreateInterviewRoundData {
                completed_at: Some(now()),
                ..scheduled("completed", TimeDelta::minutes(30))
            })
            .await
            .unwrap();
        repository.update_push_notification_sent_at("notified", now()).await.unwrap();

        let upcoming = repository.find_upcoming_within_window(60 * 60 * 1000).await.unwrap();

        assert_eq!(ids(&upcoming), vec!["sooner", "later"]);
    }
}
