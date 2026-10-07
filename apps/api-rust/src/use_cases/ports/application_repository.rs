use async_trait::async_trait;
use chrono::{DateTime, Utc};

use crate::domain::application::{Application, ApplicationStatus};
use crate::use_cases::errors::DomainResult;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApplicationTagData {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateApplicationData {
    pub id: String,
    pub user_id: String,
    pub company: String,
    pub role: String,
    pub status: ApplicationStatus,
    pub job_url: Option<String>,
    pub location: Option<String>,
    pub salary_range: Option<String>,
    pub description: Option<String>,
    /// `None` stores `false`.
    pub starred: Option<bool>,
    pub source: Option<String>,
    pub follow_up_at: Option<DateTime<Utc>>,
    pub tags: Vec<ApplicationTagData>,
}

/// A field left `None` is not written. For a nullable column, `Some(None)`
/// writes null.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct UpdateApplicationData {
    pub company: Option<String>,
    pub role: Option<String>,
    pub status: Option<ApplicationStatus>,
    pub job_url: Option<Option<String>>,
    pub location: Option<Option<String>>,
    pub salary_range: Option<Option<String>>,
    pub description: Option<Option<String>>,
    pub applied_at: Option<Option<DateTime<Utc>>>,
    pub starred: Option<bool>,
    pub source: Option<Option<String>>,
    pub follow_up_at: Option<Option<DateTime<Utc>>>,
    /// `Some` replaces the whole tag set; `Some(vec![])` clears it.
    pub tags: Option<Vec<ApplicationTagData>>,
    pub board_position: Option<i32>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct FindApplicationsFilters {
    pub status: Option<ApplicationStatus>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct FindApplicationsPageFilters {
    pub status: Option<ApplicationStatus>,
    /// Only `Some(true)` filters; `Some(false)` reads the same as `None`.
    pub starred: Option<bool>,
    /// Case-insensitive, matched against company, role, location and
    /// description. Trimmed first; blank is no filter.
    pub search: Option<String>,
    /// Only `Some(true)` filters.
    pub likely_ghosted: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FindApplicationsPagePagination {
    /// The id of the last application of the previous page.
    pub cursor: Option<String>,
    pub limit: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApplicationsPage {
    pub items: Vec<Application>,
    pub has_next_page: bool,
}

#[async_trait]
pub trait ApplicationRepository: Send + Sync {
    /// Live applications, newest first.
    async fn find_all_by_user_id(
        &self,
        user_id: &str,
        filters: FindApplicationsFilters,
    ) -> DomainResult<Vec<Application>>;
    /// Live applications, newest first, one page at a time.
    async fn find_page_by_user_id(
        &self,
        user_id: &str,
        filters: FindApplicationsPageFilters,
        pagination: FindApplicationsPagePagination,
    ) -> DomainResult<ApplicationsPage>;
    /// Hides trashed applications: every ownership check goes through here,
    /// so nothing can be attached to an application that is in Trash.
    async fn find_by_id(&self, id: &str) -> DomainResult<Option<Application>>;
    /// The deliberate exception: the detail query and the Trash operations.
    async fn find_by_id_including_trashed(&self, id: &str) -> DomainResult<Option<Application>>;
    /// Most recently trashed first.
    async fn find_trashed_by_user_id(&self, user_id: &str) -> DomainResult<Vec<Application>>;
    /// Trashed at or before `deleted_before`, across every user.
    async fn find_due_for_purge(
        &self,
        deleted_before: DateTime<Utc>,
    ) -> DomainResult<Vec<Application>>;
    async fn soft_delete(&self, id: &str, deleted_at: DateTime<Utc>) -> DomainResult<()>;
    async fn restore(&self, id: &str) -> DomainResult<()>;
    /// Renumber one kanban column to exactly `ordered_ids`, writing 0…n-1, and
    /// return the column as it now reads.
    ///
    /// Scoped to the user's live applications in `status`: an id belonging to
    /// someone else, to another column, or to a trashed application matches no
    /// row and is silently ignored. The use case rejects those cases up front
    /// so the caller gets a real error; this scoping is the second lock, not
    /// the first.
    async fn reorder_board(
        &self,
        user_id: &str,
        status: ApplicationStatus,
        ordered_ids: &[String],
    ) -> DomainResult<Vec<Application>>;
    /// Reserves a slot of the user's application quota in the same
    /// transaction, failing with `QUOTA_EXCEEDED` when none is left.
    async fn create(&self, data: CreateApplicationData) -> DomainResult<Application>;
    async fn update(&self, id: &str, data: UpdateApplicationData) -> DomainResult<Application>;
    /// Removes the row outright and gives its quota slot back.
    async fn delete(&self, id: &str) -> DomainResult<()>;
    async fn find_due_for_reminder(&self) -> DomainResult<Vec<Application>>;
    async fn update_reminder_sent_at(&self, id: &str, sent_at: DateTime<Utc>) -> DomainResult<()>;
}
