//! Caches a user's work experience, as `apps/api`'s
//! `CachedWorkExperienceRepository` does: the list and the by-id lookup.

use std::sync::Arc;

use async_trait::async_trait;

use super::cache_dto::{cached_list, cached_option, WorkExperienceDto};
use crate::domain::work_experience::WorkExperience;
use crate::infrastructure::cache::cache_keys::{work_experience_by_id, work_experience_list};
use crate::infrastructure::cache::Cache;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{
    CreateWorkExperienceData, UpdateWorkExperienceData, WorkExperienceRepository,
};

pub struct CachedWorkExperienceRepository {
    inner: Arc<dyn WorkExperienceRepository>,
    cache: Arc<dyn Cache>,
}

impl CachedWorkExperienceRepository {
    pub fn new(inner: Arc<dyn WorkExperienceRepository>, cache: Arc<dyn Cache>) -> Self {
        Self { inner, cache }
    }
}

#[async_trait]
impl WorkExperienceRepository for CachedWorkExperienceRepository {
    async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<WorkExperience>> {
        cached_list::<WorkExperienceDto, _, _>(&*self.cache, &work_experience_list(user_id), || {
            self.inner.find_all_by_user_id(user_id)
        })
        .await
    }

    async fn find_by_id(&self, id: &str) -> DomainResult<Option<WorkExperience>> {
        cached_option::<WorkExperienceDto, _, _>(&*self.cache, &work_experience_by_id(id), || {
            self.inner.find_by_id(id)
        })
        .await
    }

    async fn create(&self, data: CreateWorkExperienceData) -> DomainResult<WorkExperience> {
        let result = self.inner.create(data).await?;
        self.cache.delete(&work_experience_list(&result.user_id)).await;
        Ok(result)
    }

    async fn update(
        &self,
        id: &str,
        data: UpdateWorkExperienceData,
    ) -> DomainResult<WorkExperience> {
        let result = self.inner.update(id, data).await?;
        self.cache.delete(&work_experience_by_id(id)).await;
        self.cache.delete(&work_experience_list(&result.user_id)).await;
        Ok(result)
    }

    async fn delete(&self, id: &str, user_id: &str) -> DomainResult<()> {
        self.inner.delete(id, user_id).await?;
        self.cache.delete(&work_experience_by_id(id)).await;
        self.cache.delete(&work_experience_list(user_id)).await;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::cache::MemoryCache;
    use crate::use_cases::clock::now;
    use crate::use_cases::test_support::FakeWorkExperienceRepository;

    fn work(id: &str, user_id: &str) -> WorkExperience {
        WorkExperience {
            id: id.to_string(),
            user_id: user_id.to_string(),
            company: format!("company {id}"),
            title: "Engineer".to_string(),
            location: None,
            start_date: now(),
            end_date: None,
            description: None,
            created_at: now(),
            updated_at: now(),
        }
    }

    fn create_data(id: &str, user_id: &str) -> CreateWorkExperienceData {
        CreateWorkExperienceData {
            id: id.to_string(),
            user_id: user_id.to_string(),
            company: "new".to_string(),
            title: "Engineer".to_string(),
            location: None,
            start_date: now(),
            end_date: None,
            description: None,
        }
    }

    fn repository(
        rows: Vec<WorkExperience>,
    ) -> (Arc<FakeWorkExperienceRepository>, CachedWorkExperienceRepository) {
        let inner = Arc::new(FakeWorkExperienceRepository::with(rows));
        let cached =
            CachedWorkExperienceRepository::new(inner.clone(), Arc::new(MemoryCache::default()));
        (inner, cached)
    }

    #[tokio::test]
    async fn serves_repeated_reads_from_the_cache() {
        let (inner, cached) = repository(vec![work("w1", "u1")]);
        cached.find_all_by_user_id("u1").await.unwrap();
        cached.find_by_id("w1").await.unwrap();

        inner.create(create_data("w2", "u1")).await.unwrap();
        inner.delete("w1", "u1").await.unwrap();

        assert_eq!(cached.find_all_by_user_id("u1").await.unwrap().len(), 1);
        assert!(cached.find_by_id("w1").await.unwrap().is_some());
    }

    #[tokio::test]
    async fn caches_a_missing_entry_as_missing() {
        let (inner, cached) = repository(vec![]);
        assert_eq!(cached.find_by_id("w1").await.unwrap(), None);
        inner.create(create_data("w1", "u1")).await.unwrap();
        assert_eq!(cached.find_by_id("w1").await.unwrap(), None);
    }

    #[tokio::test]
    async fn create_invalidates_the_list() {
        let (_, cached) = repository(vec![work("w1", "u1")]);
        cached.find_all_by_user_id("u1").await.unwrap();

        cached.create(create_data("w2", "u1")).await.unwrap();

        assert_eq!(cached.find_all_by_user_id("u1").await.unwrap().len(), 2);
    }

    #[tokio::test]
    async fn update_invalidates_the_entry_and_the_list() {
        let (_, cached) = repository(vec![work("w1", "u1")]);
        cached.find_by_id("w1").await.unwrap();
        cached.find_all_by_user_id("u1").await.unwrap();

        let update =
            UpdateWorkExperienceData { company: Some("renamed".to_string()), ..Default::default() };
        cached.update("w1", update).await.unwrap();

        assert_eq!(cached.find_by_id("w1").await.unwrap().unwrap().company, "renamed");
        assert_eq!(cached.find_all_by_user_id("u1").await.unwrap()[0].company, "renamed");
    }

    #[tokio::test]
    async fn delete_invalidates_the_entry_and_the_list() {
        let (_, cached) = repository(vec![work("w1", "u1")]);
        cached.find_by_id("w1").await.unwrap();
        cached.find_all_by_user_id("u1").await.unwrap();

        cached.delete("w1", "u1").await.unwrap();

        assert_eq!(cached.find_by_id("w1").await.unwrap(), None);
        assert!(cached.find_all_by_user_id("u1").await.unwrap().is_empty());
    }
}
