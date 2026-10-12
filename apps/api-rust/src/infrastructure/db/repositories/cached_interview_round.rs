//! Caches the interview rounds of one application, as `apps/api`'s
//! `CachedInterviewRoundRepository` does: the list and the by-id lookup.

use std::sync::Arc;

use async_trait::async_trait;
use chrono::{DateTime, Utc};

use super::cache_dto::{cached_list, cached_option, InterviewRoundDto};
use crate::domain::interview_round::InterviewRound;
use crate::infrastructure::cache::cache_keys::{round_by_id, round_list};
use crate::infrastructure::cache::Cache;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{
    CreateInterviewRoundData, InterviewRoundRepository, UpdateInterviewRoundData,
};

pub struct CachedInterviewRoundRepository {
    inner: Arc<dyn InterviewRoundRepository>,
    cache: Arc<dyn Cache>,
}

impl CachedInterviewRoundRepository {
    pub fn new(inner: Arc<dyn InterviewRoundRepository>, cache: Arc<dyn Cache>) -> Self {
        Self { inner, cache }
    }
}

#[async_trait]
impl InterviewRoundRepository for CachedInterviewRoundRepository {
    async fn find_all_by_application_id(
        &self,
        application_id: &str,
    ) -> DomainResult<Vec<InterviewRound>> {
        cached_list::<InterviewRoundDto, _, _>(&*self.cache, &round_list(application_id), || {
            self.inner.find_all_by_application_id(application_id)
        })
        .await
    }

    /// Not cached: a single `COUNT(*)` is not worth a key and an invalidation path.
    async fn count_by_application_id(&self, application_id: &str) -> DomainResult<i64> {
        self.inner.count_by_application_id(application_id).await
    }

    /// Not cached: it reads across every application of the user, which the
    /// per-application keys cannot invalidate.
    async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<InterviewRound>> {
        self.inner.find_all_by_user_id(user_id).await
    }

    async fn find_by_id(&self, id: &str) -> DomainResult<Option<InterviewRound>> {
        cached_option::<InterviewRoundDto, _, _>(&*self.cache, &round_by_id(id), || {
            self.inner.find_by_id(id)
        })
        .await
    }

    /// Not cached: the time window changes on every call.
    async fn find_upcoming_within_window(
        &self,
        window_ms: i64,
    ) -> DomainResult<Vec<InterviewRound>> {
        self.inner.find_upcoming_within_window(window_ms).await
    }

    async fn create(&self, data: CreateInterviewRoundData) -> DomainResult<InterviewRound> {
        let result = self.inner.create(data).await?;
        self.cache.delete(&round_list(&result.application_id)).await;
        Ok(result)
    }

    async fn update(
        &self,
        id: &str,
        data: UpdateInterviewRoundData,
    ) -> DomainResult<InterviewRound> {
        let result = self.inner.update(id, data).await?;
        self.cache.delete(&round_by_id(id)).await;
        self.cache.delete(&round_list(&result.application_id)).await;
        Ok(result)
    }

    /// The owning application is learned through this repository's own cached
    /// `find_by_id` (shared, so correct across instances), as in `apps/api`.
    async fn update_push_notification_sent_at(
        &self,
        id: &str,
        sent_at: DateTime<Utc>,
    ) -> DomainResult<()> {
        let existing = self.find_by_id(id).await?;
        self.inner.update_push_notification_sent_at(id, sent_at).await?;
        self.cache.delete(&round_by_id(id)).await;
        if let Some(existing) = existing {
            self.cache.delete(&round_list(&existing.application_id)).await;
        }
        Ok(())
    }

    async fn delete(&self, id: &str, application_id: &str) -> DomainResult<()> {
        self.inner.delete(id, application_id).await?;
        self.cache.delete(&round_by_id(id)).await;
        self.cache.delete(&round_list(application_id)).await;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::interview_round::{InterviewRoundOutcome, InterviewRoundType};
    use crate::infrastructure::cache::MemoryCache;
    use crate::use_cases::clock::now;
    use crate::use_cases::test_support::FakeInterviewRoundRepository;

    fn round(id: &str, application_id: &str) -> InterviewRound {
        InterviewRound {
            id: id.to_string(),
            application_id: application_id.to_string(),
            r#type: InterviewRoundType::Phone,
            scheduled_at: None,
            completed_at: None,
            interviewer_name: None,
            notes: None,
            outcome: InterviewRoundOutcome::Pending,
            push_notification_sent_at: None,
            created_at: now(),
            updated_at: now(),
        }
    }

    fn create_data(id: &str, application_id: &str) -> CreateInterviewRoundData {
        CreateInterviewRoundData {
            id: id.to_string(),
            application_id: application_id.to_string(),
            r#type: InterviewRoundType::Hr,
            scheduled_at: None,
            completed_at: None,
            interviewer_name: None,
            notes: None,
            outcome: None,
        }
    }

    fn repository(
        rows: Vec<InterviewRound>,
    ) -> (Arc<FakeInterviewRoundRepository>, CachedInterviewRoundRepository) {
        let inner = Arc::new(FakeInterviewRoundRepository::with(rows));
        let cached =
            CachedInterviewRoundRepository::new(inner.clone(), Arc::new(MemoryCache::default()));
        (inner, cached)
    }

    #[tokio::test]
    async fn serves_repeated_reads_from_the_cache() {
        let (inner, cached) = repository(vec![round("r1", "a1")]);
        cached.find_all_by_application_id("a1").await.unwrap();
        cached.find_by_id("r1").await.unwrap();

        inner.create(create_data("r2", "a1")).await.unwrap();
        inner.delete("r1", "a1").await.unwrap();

        assert_eq!(cached.find_all_by_application_id("a1").await.unwrap().len(), 1);
        assert!(cached.find_by_id("r1").await.unwrap().is_some());
    }

    #[tokio::test]
    async fn caches_a_missing_round_as_missing() {
        let (inner, cached) = repository(vec![]);
        assert_eq!(cached.find_by_id("r1").await.unwrap(), None);
        inner.create(create_data("r1", "a1")).await.unwrap();
        assert_eq!(cached.find_by_id("r1").await.unwrap(), None);
    }

    #[tokio::test]
    async fn create_invalidates_the_list() {
        let (_, cached) = repository(vec![round("r1", "a1")]);
        cached.find_all_by_application_id("a1").await.unwrap();

        cached.create(create_data("r2", "a1")).await.unwrap();

        assert_eq!(cached.find_all_by_application_id("a1").await.unwrap().len(), 2);
    }

    #[tokio::test]
    async fn update_invalidates_the_round_and_the_list() {
        let (_, cached) = repository(vec![round("r1", "a1")]);
        cached.find_by_id("r1").await.unwrap();
        cached.find_all_by_application_id("a1").await.unwrap();

        let update = UpdateInterviewRoundData {
            outcome: Some(InterviewRoundOutcome::Passed),
            ..Default::default()
        };
        cached.update("r1", update).await.unwrap();

        let passed = InterviewRoundOutcome::Passed;
        assert_eq!(cached.find_by_id("r1").await.unwrap().unwrap().outcome, passed);
        assert_eq!(cached.find_all_by_application_id("a1").await.unwrap()[0].outcome, passed);
    }

    #[tokio::test]
    async fn delete_invalidates_the_round_and_the_list() {
        let (_, cached) = repository(vec![round("r1", "a1")]);
        cached.find_by_id("r1").await.unwrap();
        cached.find_all_by_application_id("a1").await.unwrap();

        cached.delete("r1", "a1").await.unwrap();

        assert_eq!(cached.find_by_id("r1").await.unwrap(), None);
        assert!(cached.find_all_by_application_id("a1").await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn marking_a_push_sent_invalidates_the_round_and_its_applications_list() {
        let (_, cached) = repository(vec![round("r1", "a1")]);
        cached.find_all_by_application_id("a1").await.unwrap();

        cached.update_push_notification_sent_at("r1", now()).await.unwrap();

        let rounds = cached.find_all_by_application_id("a1").await.unwrap();
        assert!(rounds[0].push_notification_sent_at.is_some());
        assert!(cached
            .find_by_id("r1")
            .await
            .unwrap()
            .unwrap()
            .push_notification_sent_at
            .is_some());
    }

    #[tokio::test]
    async fn marking_an_unknown_round_still_reaches_the_inner_repository() {
        let (_, cached) = repository(vec![]);
        cached.update_push_notification_sent_at("nope", now()).await.unwrap();
    }

    #[tokio::test]
    async fn the_count_the_per_user_read_and_the_window_are_never_cached() {
        let (inner, cached) = repository(vec![round("r1", "a1")]);
        assert_eq!(cached.count_by_application_id("a1").await.unwrap(), 1);
        assert!(cached.find_upcoming_within_window(1000).await.unwrap().is_empty());
        inner.create(create_data("r2", "a1")).await.unwrap();
        assert_eq!(cached.count_by_application_id("a1").await.unwrap(), 2);
    }
}
