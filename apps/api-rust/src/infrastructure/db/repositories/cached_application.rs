//! Caches applications, as `apps/api`'s `CachedApplicationRepository` does:
//! the per-user (and per-status) list, the by-id lookup and the Trash list.
//!
//! The list keys share the prefix `apps:list:<user>:`, so one prefix delete
//! drops every status of a user's list at once. Every write that changes what
//! a list holds has to do that, which is the point of this decorator.
//!
//! `find_by_id` hides trashed rows, so the writes that need the owner of a
//! row that may already be trashed (`delete`, `soft_delete`, `restore`) look
//! it up with `find_by_id_including_trashed`, uncached.

use std::sync::Arc;

use async_trait::async_trait;
use chrono::{DateTime, Utc};

use super::cache_dto::{cached_list, cached_option, ApplicationDto};
use crate::domain::application::{Application, ApplicationStatus};
use crate::infrastructure::cache::cache_keys::{
    app_by_id, app_list, app_list_prefix, app_trash_list,
};
use crate::infrastructure::cache::Cache;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{
    ApplicationRepository, ApplicationsPage, CreateApplicationData, FindApplicationsFilters,
    FindApplicationsPageFilters, FindApplicationsPagePagination, UpdateApplicationData,
};

pub struct CachedApplicationRepository {
    inner: Arc<dyn ApplicationRepository>,
    cache: Arc<dyn Cache>,
}

impl CachedApplicationRepository {
    pub fn new(inner: Arc<dyn ApplicationRepository>, cache: Arc<dyn Cache>) -> Self {
        Self { inner, cache }
    }

    /// What `softDelete` and `restore` drop: the row, the user's lists and the
    /// Trash list.
    async fn invalidate(&self, id: &str, user_id: Option<&str>) {
        self.cache.delete(&app_by_id(id)).await;
        if let Some(user_id) = user_id {
            self.cache.delete_by_prefix(&app_list_prefix(user_id)).await;
            self.cache.delete(&app_trash_list(user_id)).await;
        }
    }
}

#[async_trait]
impl ApplicationRepository for CachedApplicationRepository {
    async fn find_all_by_user_id(
        &self,
        user_id: &str,
        filters: FindApplicationsFilters,
    ) -> DomainResult<Vec<Application>> {
        // No status is the empty suffix: `apps:list:<user>:`.
        let status = filters.status.map_or("", ApplicationStatus::as_str);
        cached_list::<ApplicationDto, _, _>(&*self.cache, &app_list(user_id, status), || {
            self.inner.find_all_by_user_id(user_id, filters.clone())
        })
        .await
    }

    /// Not cached: cursor, search and filter combinations are too varied to key.
    async fn find_page_by_user_id(
        &self,
        user_id: &str,
        filters: FindApplicationsPageFilters,
        pagination: FindApplicationsPagePagination,
    ) -> DomainResult<ApplicationsPage> {
        self.inner.find_page_by_user_id(user_id, filters, pagination).await
    }

    async fn find_by_id(&self, id: &str) -> DomainResult<Option<Application>> {
        cached_option::<ApplicationDto, _, _>(&*self.cache, &app_by_id(id), || {
            self.inner.find_by_id(id)
        })
        .await
    }

    /// Not cached: the Trash operations and the detail query need the row as
    /// it is right now.
    async fn find_by_id_including_trashed(&self, id: &str) -> DomainResult<Option<Application>> {
        self.inner.find_by_id_including_trashed(id).await
    }

    async fn find_trashed_by_user_id(&self, user_id: &str) -> DomainResult<Vec<Application>> {
        cached_list::<ApplicationDto, _, _>(&*self.cache, &app_trash_list(user_id), || {
            self.inner.find_trashed_by_user_id(user_id)
        })
        .await
    }

    /// Not cached: the purge job runs once a day and must see the truth.
    async fn find_due_for_purge(
        &self,
        deleted_before: DateTime<Utc>,
    ) -> DomainResult<Vec<Application>> {
        self.inner.find_due_for_purge(deleted_before).await
    }

    async fn soft_delete(&self, id: &str, deleted_at: DateTime<Utc>) -> DomainResult<()> {
        let existing = self.inner.find_by_id_including_trashed(id).await?;
        self.inner.soft_delete(id, deleted_at).await?;
        self.invalidate(id, existing.as_ref().map(|app| app.user_id.as_str())).await;
        Ok(())
    }

    async fn restore(&self, id: &str) -> DomainResult<()> {
        let existing = self.inner.find_by_id_including_trashed(id).await?;
        self.inner.restore(id).await?;
        self.invalidate(id, existing.as_ref().map(|app| app.user_id.as_str())).await;
        Ok(())
    }

    /// A reorder changes exactly what the list cache holds, the order of a
    /// column: without busting it the board reads its old order straight back.
    async fn reorder_board(
        &self,
        user_id: &str,
        status: ApplicationStatus,
        ordered_ids: &[String],
    ) -> DomainResult<Vec<Application>> {
        let result = self.inner.reorder_board(user_id, status, ordered_ids).await?;
        for id in ordered_ids {
            self.cache.delete(&app_by_id(id)).await;
        }
        self.cache.delete_by_prefix(&app_list_prefix(user_id)).await;
        Ok(result)
    }

    async fn create(&self, data: CreateApplicationData) -> DomainResult<Application> {
        let result = self.inner.create(data).await?;
        self.cache.delete_by_prefix(&app_list_prefix(&result.user_id)).await;
        Ok(result)
    }

    async fn update(&self, id: &str, data: UpdateApplicationData) -> DomainResult<Application> {
        let result = self.inner.update(id, data).await?;
        self.cache.delete(&app_by_id(id)).await;
        self.cache.delete_by_prefix(&app_list_prefix(&result.user_id)).await;
        Ok(result)
    }

    async fn delete(&self, id: &str) -> DomainResult<()> {
        // Including trashed: by the time anything calls this the row is
        // usually soft-deleted already, and `find_by_id` filters those out.
        let existing = self.inner.find_by_id_including_trashed(id).await?;
        self.inner.delete(id).await?;
        self.cache.delete(&app_by_id(id)).await;
        if let Some(existing) = existing {
            self.cache.delete_by_prefix(&app_list_prefix(&existing.user_id)).await;
            self.cache.delete(&app_trash_list(&existing.user_id)).await;
        }
        Ok(())
    }

    /// Not cached.
    async fn find_due_for_reminder(&self) -> DomainResult<Vec<Application>> {
        self.inner.find_due_for_reminder().await
    }

    /// The owner is learned through this repository's own cached `find_by_id`
    /// (shared through Redis, so correct across instances). Unlike
    /// `soft_delete`, the Trash list is not dropped, as in the original.
    async fn update_reminder_sent_at(&self, id: &str, sent_at: DateTime<Utc>) -> DomainResult<()> {
        let existing = self.find_by_id(id).await?;
        self.inner.update_reminder_sent_at(id, sent_at).await?;
        self.cache.delete(&app_by_id(id)).await;
        if let Some(existing) = existing {
            self.cache.delete_by_prefix(&app_list_prefix(&existing.user_id)).await;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::cache::MemoryCache;
    use crate::use_cases::clock::now;
    use crate::use_cases::test_support::{application_owned_by, FakeApplicationRepository};

    fn create_data(id: &str, user_id: &str, status: ApplicationStatus) -> CreateApplicationData {
        CreateApplicationData {
            id: id.to_string(),
            user_id: user_id.to_string(),
            company: "Acme".to_string(),
            role: "Engineer".to_string(),
            status,
            job_url: None,
            location: None,
            salary_range: None,
            description: None,
            starred: None,
            source: None,
            follow_up_at: None,
            tags: vec![],
        }
    }

    fn all() -> FindApplicationsFilters {
        FindApplicationsFilters::default()
    }

    fn only(status: ApplicationStatus) -> FindApplicationsFilters {
        FindApplicationsFilters { status: Some(status) }
    }

    fn repository(
        apps: Vec<Application>,
    ) -> (Arc<FakeApplicationRepository>, CachedApplicationRepository) {
        let inner = Arc::new(FakeApplicationRepository::with(apps));
        let cached =
            CachedApplicationRepository::new(inner.clone(), Arc::new(MemoryCache::default()));
        (inner, cached)
    }

    #[tokio::test]
    async fn serves_repeated_reads_from_the_cache() {
        let (inner, cached) = repository(vec![application_owned_by("a1", "u1")]);
        cached.find_all_by_user_id("u1", all()).await.unwrap();
        cached.find_by_id("a1").await.unwrap();

        inner.soft_delete("a1", now()).await.unwrap();

        assert_eq!(cached.find_all_by_user_id("u1", all()).await.unwrap().len(), 1);
        assert!(cached.find_by_id("a1").await.unwrap().is_some());
    }

    #[tokio::test]
    async fn keeps_a_list_per_user_and_per_status() {
        let (inner, cached) = repository(vec![application_owned_by("a1", "u1")]);
        assert_eq!(cached.find_all_by_user_id("u1", all()).await.unwrap().len(), 1);
        assert!(cached
            .find_all_by_user_id("u1", only(ApplicationStatus::Offered))
            .await
            .unwrap()
            .is_empty());
        inner.create(create_data("a2", "u2", ApplicationStatus::Applied)).await.unwrap();

        assert!(cached.find_all_by_user_id("u2", all()).await.unwrap().len() == 1);
        // Both lists of u1 are still cached.
        inner.create(create_data("a3", "u1", ApplicationStatus::Offered)).await.unwrap();
        assert_eq!(cached.find_all_by_user_id("u1", all()).await.unwrap().len(), 1);
        assert!(cached
            .find_all_by_user_id("u1", only(ApplicationStatus::Offered))
            .await
            .unwrap()
            .is_empty());
    }

    #[tokio::test]
    async fn caches_a_missing_application_as_missing() {
        let (inner, cached) = repository(vec![]);
        assert_eq!(cached.find_by_id("a1").await.unwrap(), None);
        inner.create(create_data("a1", "u1", ApplicationStatus::Applied)).await.unwrap();
        assert_eq!(cached.find_by_id("a1").await.unwrap(), None);
    }

    #[tokio::test]
    async fn create_invalidates_every_status_list_of_that_user_only() {
        let (inner, cached) = repository(vec![application_owned_by("a1", "u1")]);
        cached.find_all_by_user_id("u1", all()).await.unwrap();
        cached.find_all_by_user_id("u1", only(ApplicationStatus::Draft)).await.unwrap();
        cached.find_all_by_user_id("u2", all()).await.unwrap();
        inner.create(create_data("a9", "u2", ApplicationStatus::Applied)).await.unwrap();

        cached.create(create_data("a2", "u1", ApplicationStatus::Draft)).await.unwrap();

        assert_eq!(cached.find_all_by_user_id("u1", all()).await.unwrap().len(), 2);
        assert_eq!(
            cached.find_all_by_user_id("u1", only(ApplicationStatus::Draft)).await.unwrap().len(),
            1
        );
        assert!(cached.find_all_by_user_id("u2", all()).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn update_invalidates_the_row_and_the_lists() {
        let (_, cached) = repository(vec![application_owned_by("a1", "u1")]);
        cached.find_by_id("a1").await.unwrap();
        cached.find_all_by_user_id("u1", all()).await.unwrap();

        let update =
            UpdateApplicationData { company: Some("Globex".to_string()), ..Default::default() };
        cached.update("a1", update).await.unwrap();

        assert_eq!(cached.find_by_id("a1").await.unwrap().unwrap().company, "Globex");
        assert_eq!(cached.find_all_by_user_id("u1", all()).await.unwrap()[0].company, "Globex");
    }

    #[tokio::test]
    async fn reorder_busts_every_row_in_the_batch_and_the_users_lists() {
        let (_, cached) = repository(vec![
            application_owned_by("a1", "u1"),
            application_owned_by("a2", "u1"),
            application_owned_by("a3", "u2"),
        ]);
        cached.find_by_id("a1").await.unwrap();
        cached.find_by_id("a2").await.unwrap();
        cached.find_all_by_user_id("u1", all()).await.unwrap();
        cached.find_all_by_user_id("u2", all()).await.unwrap();

        let ordered = vec!["a2".to_string(), "a1".to_string()];
        cached.reorder_board("u1", ApplicationStatus::Applied, &ordered).await.unwrap();

        assert_eq!(cached.find_by_id("a2").await.unwrap().unwrap().board_position, 0);
        assert_eq!(cached.find_by_id("a1").await.unwrap().unwrap().board_position, 1);
        let ids: Vec<String> = cached
            .find_all_by_user_id("u1", all())
            .await
            .unwrap()
            .into_iter()
            .map(|app| app.id)
            .collect();
        assert_eq!(ids.len(), 2);
    }

    #[tokio::test]
    async fn reorder_leaves_another_users_list_alone() {
        let (inner, cached) = repository(vec![application_owned_by("a3", "u2")]);
        cached.find_all_by_user_id("u2", all()).await.unwrap();
        inner.create(create_data("a4", "u2", ApplicationStatus::Applied)).await.unwrap();

        cached.reorder_board("u1", ApplicationStatus::Applied, &[]).await.unwrap();

        assert_eq!(cached.find_all_by_user_id("u2", all()).await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn delete_finds_a_trashed_row_and_busts_its_lists_and_the_trash_list() {
        let (inner, cached) = repository(vec![application_owned_by("a1", "u1")]);
        inner.soft_delete("a1", now()).await.unwrap();
        cached.find_all_by_user_id("u1", all()).await.unwrap();
        cached.find_trashed_by_user_id("u1").await.unwrap();

        cached.delete("a1").await.unwrap();

        assert!(cached.find_trashed_by_user_id("u1").await.unwrap().is_empty());
        assert!(cached.find_all_by_user_id("u1", all()).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn delete_drops_the_by_id_entry_even_for_an_unknown_application() {
        let (_, cached) = repository(vec![]);
        cached.find_by_id("a1").await.unwrap();
        cached.delete("a1").await.unwrap();
    }

    #[tokio::test]
    async fn soft_delete_and_restore_bust_the_row_the_lists_and_the_trash_list() {
        let (_, cached) = repository(vec![application_owned_by("a1", "u1")]);
        cached.find_by_id("a1").await.unwrap();
        cached.find_all_by_user_id("u1", all()).await.unwrap();
        cached.find_trashed_by_user_id("u1").await.unwrap();

        cached.soft_delete("a1", now()).await.unwrap();

        assert_eq!(cached.find_by_id("a1").await.unwrap(), None);
        assert!(cached.find_all_by_user_id("u1", all()).await.unwrap().is_empty());
        assert_eq!(cached.find_trashed_by_user_id("u1").await.unwrap().len(), 1);

        cached.restore("a1").await.unwrap();

        assert!(cached.find_by_id("a1").await.unwrap().is_some());
        assert_eq!(cached.find_all_by_user_id("u1", all()).await.unwrap().len(), 1);
        assert!(cached.find_trashed_by_user_id("u1").await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_reminder_stamp_busts_the_row_and_the_lists_but_not_the_trash_list() {
        let (inner, cached) = repository(vec![application_owned_by("a1", "u1")]);
        cached.find_by_id("a1").await.unwrap();
        cached.find_all_by_user_id("u1", all()).await.unwrap();
        cached.find_trashed_by_user_id("u1").await.unwrap();
        inner.create(create_data("a2", "u1", ApplicationStatus::Applied)).await.unwrap();
        inner.soft_delete("a2", now()).await.unwrap();

        cached.update_reminder_sent_at("a1", now()).await.unwrap();

        assert!(cached.find_by_id("a1").await.unwrap().unwrap().reminder_sent_at.is_some());
        assert_eq!(cached.find_all_by_user_id("u1", all()).await.unwrap().len(), 1);
        // The Trash list was cached before a2 was trashed and stays so.
        assert!(cached.find_trashed_by_user_id("u1").await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_reminder_stamp_for_an_unknown_application_still_reaches_the_inner_repository() {
        let (_, cached) = repository(vec![]);
        cached.update_reminder_sent_at("nope", now()).await.unwrap();
    }

    #[tokio::test]
    async fn the_page_the_detail_read_the_purge_and_the_reminders_are_never_cached() {
        let (inner, cached) = repository(vec![application_owned_by("a1", "u1")]);
        let page = || FindApplicationsPagePagination { cursor: None, limit: 10 };
        let none = FindApplicationsPageFilters::default;
        assert_eq!(cached.find_page_by_user_id("u1", none(), page()).await.unwrap().items.len(), 1);
        assert!(cached.find_by_id_including_trashed("a1").await.unwrap().is_some());
        assert!(cached.find_due_for_purge(now()).await.unwrap().is_empty());
        assert!(cached.find_due_for_reminder().await.unwrap().is_empty());

        inner.soft_delete("a1", now() - chrono::TimeDelta::days(31)).await.unwrap();

        assert!(cached.find_page_by_user_id("u1", none(), page()).await.unwrap().items.is_empty());
        assert_eq!(cached.find_by_id_including_trashed("a1").await.unwrap().unwrap().id, "a1");
        assert_eq!(cached.find_due_for_purge(now()).await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn a_status_change_shows_up_in_the_users_status_lists() {
        let (_, cached) = repository(vec![application_owned_by("a1", "u1")]);
        cached.find_all_by_user_id("u1", only(ApplicationStatus::Offered)).await.unwrap();

        let update = UpdateApplicationData {
            status: Some(ApplicationStatus::Offered),
            ..Default::default()
        };
        cached.update("a1", update).await.unwrap();

        assert_eq!(
            cached.find_all_by_user_id("u1", only(ApplicationStatus::Offered)).await.unwrap().len(),
            1
        );
    }
}
