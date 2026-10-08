use std::cmp::Ordering;
use std::collections::HashMap;
use std::sync::Mutex;

use async_trait::async_trait;
use chrono::{DateTime, TimeDelta, Utc};

use crate::domain::application::{Application, ApplicationStatus};
use crate::use_cases::clock::now;
use crate::use_cases::constants::{content_limits, reminder_window_ms};
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::jobs::application_staleness::is_likely_ghosted;
use crate::use_cases::ports::{
    ApplicationRepository, ApplicationsPage, CreateApplicationData, FindApplicationsFilters,
    FindApplicationsPageFilters, FindApplicationsPagePagination, UpdateApplicationData,
};

/// A live application with unremarkable field values.
pub fn application_owned_by(id: &str, user_id: &str) -> Application {
    let epoch = DateTime::<Utc>::UNIX_EPOCH;
    Application {
        id: id.to_string(),
        user_id: user_id.to_string(),
        company: "Acme".to_string(),
        role: "Engineer".to_string(),
        status: ApplicationStatus::Applied,
        job_url: None,
        location: None,
        salary_range: None,
        description: None,
        applied_at: None,
        starred: false,
        source: None,
        follow_up_at: None,
        tags: Vec::new(),
        reminder_sent_at: None,
        board_position: 0,
        deleted_at: None,
        created_at: epoch,
        updated_at: epoch,
    }
}

#[derive(Default)]
struct State {
    applications: Vec<Application>,
    /// `User.applicationCount`, per user id.
    application_counts: HashMap<String, i32>,
}

/// Behaves like the Postgres repository, with these differences:
///
/// - There is no user table. Every user id exists and starts with an
///   application count of 0, whereas the real `create` reports the quota as
///   exceeded for a user id that matches no row.
/// - Applications handed to [`FakeApplicationRepository::with`] are seeded the
///   way a raw `INSERT` would: they do not count against the quota. Use
///   [`FakeApplicationRepository::set_application_count`] to stage one.
/// - Ids compare bytewise where Postgres uses the database collation.
/// - Deleting an application does not cascade into the other fakes.
#[derive(Default)]
pub struct FakeApplicationRepository {
    state: Mutex<State>,
}

impl FakeApplicationRepository {
    pub fn with(applications: Vec<Application>) -> Self {
        Self { state: Mutex::new(State { applications, ..State::default() }) }
    }

    /// Every stored application, trashed ones included, in insertion order.
    pub fn all(&self) -> Vec<Application> {
        self.state.lock().unwrap().applications.clone()
    }

    /// The user's `applicationCount` quota counter.
    pub fn application_count(&self, user_id: &str) -> i32 {
        self.state.lock().unwrap().application_counts.get(user_id).copied().unwrap_or(0)
    }

    pub fn set_application_count(&self, user_id: &str, count: i32) {
        self.state.lock().unwrap().application_counts.insert(user_id.to_string(), count);
    }

    fn matching(&self, keep: impl Fn(&Application) -> bool) -> Vec<Application> {
        self.all().into_iter().filter(|application| keep(application)).collect()
    }

    /// Applies `change` to the application with this id, if there is one.
    fn modify(&self, id: &str, change: impl FnOnce(&mut Application)) {
        let mut state = self.state.lock().unwrap();
        if let Some(application) = state.applications.iter_mut().find(|a| a.id == id) {
            change(application);
        }
    }
}

/// `createdAt DESC, id DESC`.
fn newest_first(a: &Application, b: &Application) -> Ordering {
    b.created_at.cmp(&a.created_at).then_with(|| b.id.cmp(&a.id))
}

fn is_live(application: &Application) -> bool {
    application.deleted_at.is_none()
}

/// Postgres `ILIKE` with the default escape character: `%` is any run, `_`
/// any one character, `\` takes the next character literally.
fn ilike(value: &str, pattern: &str) -> bool {
    fn matches(value: &[char], pattern: &[char]) -> bool {
        match pattern.split_first() {
            None => value.is_empty(),
            Some(('%', rest)) => (0..=value.len()).any(|skip| matches(&value[skip..], rest)),
            Some(('_', rest)) => !value.is_empty() && matches(&value[1..], rest),
            Some(('\\', rest)) => match rest.split_first() {
                Some((literal, rest)) => {
                    value.first() == Some(literal) && matches(&value[1..], rest)
                }
                None => false,
            },
            Some((literal, rest)) => value.first() == Some(literal) && matches(&value[1..], rest),
        }
    }
    let value: Vec<char> = value.to_lowercase().chars().collect();
    let pattern: Vec<char> = pattern.to_lowercase().chars().collect();
    matches(&value, &pattern)
}

fn matches_search(application: &Application, search: &str) -> bool {
    let pattern = format!("%{search}%");
    let nullable = |field: &Option<String>| field.as_deref().is_some_and(|v| ilike(v, &pattern));
    ilike(&application.company, &pattern)
        || ilike(&application.role, &pattern)
        || nullable(&application.location)
        || nullable(&application.description)
}

#[async_trait]
impl ApplicationRepository for FakeApplicationRepository {
    async fn find_all_by_user_id(
        &self,
        user_id: &str,
        filters: FindApplicationsFilters,
    ) -> DomainResult<Vec<Application>> {
        let mut found = self.matching(|application| {
            application.user_id == user_id
                && is_live(application)
                && filters.status.is_none_or(|status| application.status == status)
        });
        found.sort_by(newest_first);
        Ok(found)
    }

    async fn find_page_by_user_id(
        &self,
        user_id: &str,
        filters: FindApplicationsPageFilters,
        pagination: FindApplicationsPagePagination,
    ) -> DomainResult<ApplicationsPage> {
        let search = filters.search.as_deref().map(str::trim).filter(|search| !search.is_empty());
        let now = now();
        // The cursor row is looked up by id alone, as the query does; an
        // unknown cursor constrains nothing.
        let cursor = pagination
            .cursor
            .filter(|cursor| !cursor.is_empty())
            .and_then(|cursor| self.all().into_iter().find(|a| a.id == cursor));

        let mut items = self.matching(|application| {
            application.user_id == user_id
                && is_live(application)
                && filters.status.is_none_or(|status| application.status == status)
                && (filters.starred != Some(true) || application.starred)
                && (filters.likely_ghosted != Some(true) || is_likely_ghosted(application, now))
                && search.is_none_or(|search| matches_search(application, search))
                && cursor.as_ref().is_none_or(|cursor| {
                    application.created_at < cursor.created_at
                        || (application.created_at == cursor.created_at
                            && application.id < cursor.id)
                })
        });
        items.sort_by(newest_first);

        let limit = usize::try_from(pagination.limit).unwrap_or(0);
        let has_next_page = items.len() > limit;
        items.truncate(limit);
        Ok(ApplicationsPage { items, has_next_page })
    }

    async fn find_by_id(&self, id: &str) -> DomainResult<Option<Application>> {
        Ok(self.matching(|application| application.id == id && is_live(application)).pop())
    }

    async fn find_by_id_including_trashed(&self, id: &str) -> DomainResult<Option<Application>> {
        Ok(self.matching(|application| application.id == id).pop())
    }

    async fn find_trashed_by_user_id(&self, user_id: &str) -> DomainResult<Vec<Application>> {
        let mut found =
            self.matching(|application| application.user_id == user_id && !is_live(application));
        found.sort_by(|a, b| b.deleted_at.cmp(&a.deleted_at).then_with(|| b.id.cmp(&a.id)));
        Ok(found)
    }

    async fn find_due_for_purge(
        &self,
        deleted_before: DateTime<Utc>,
    ) -> DomainResult<Vec<Application>> {
        Ok(self.matching(|application| {
            application.deleted_at.is_some_and(|deleted_at| deleted_at <= deleted_before)
        }))
    }

    // The three single-column writes move `updated_at`, as the real ones do.

    async fn soft_delete(&self, id: &str, deleted_at: DateTime<Utc>) -> DomainResult<()> {
        self.modify(id, |application| {
            application.deleted_at = Some(deleted_at);
            application.updated_at = now();
        });
        Ok(())
    }

    async fn restore(&self, id: &str) -> DomainResult<()> {
        self.modify(id, |application| {
            application.deleted_at = None;
            application.updated_at = now();
        });
        Ok(())
    }

    async fn reorder_board(
        &self,
        user_id: &str,
        status: ApplicationStatus,
        ordered_ids: &[String],
    ) -> DomainResult<Vec<Application>> {
        let in_column = |application: &Application| {
            application.user_id == user_id && application.status == status && is_live(application)
        };

        {
            let mut state = self.state.lock().unwrap();
            for application in state.applications.iter_mut().filter(|a| in_column(a)) {
                // `updated_at` is deliberately left alone.
                if let Some(index) = ordered_ids.iter().position(|id| *id == application.id) {
                    application.board_position = index as i32;
                }
            }
        }

        let mut column = self.matching(in_column);
        column.sort_by(|a, b| {
            a.board_position.cmp(&b.board_position).then_with(|| newest_first(a, b))
        });
        Ok(column)
    }

    async fn create(&self, data: CreateApplicationData) -> DomainResult<Application> {
        let mut state = self.state.lock().unwrap();

        let count = state.application_counts.get(&data.user_id).copied().unwrap_or(0);
        if count >= content_limits::APPLICATIONS_PER_USER {
            return Err(DomainError::quota_exceeded(format!(
                "You have reached the maximum of {} applications",
                content_limits::APPLICATIONS_PER_USER
            )));
        }
        // The primary key; the transaction would roll the reservation back.
        if state.applications.iter().any(|application| application.id == data.id) {
            return Err(DomainError::internal(format!("duplicate application id {:?}", data.id)));
        }
        state.application_counts.insert(data.user_id.clone(), count + 1);

        let timestamp = now();
        let application = Application {
            id: data.id,
            user_id: data.user_id,
            company: data.company,
            role: data.role,
            status: data.status,
            job_url: data.job_url,
            location: data.location,
            salary_range: data.salary_range,
            description: data.description,
            applied_at: None,
            starred: data.starred.unwrap_or(false),
            source: data.source,
            follow_up_at: data.follow_up_at,
            tags: data.tags.into_iter().map(|tag| tag.name).collect(),
            reminder_sent_at: None,
            board_position: 0,
            deleted_at: None,
            created_at: timestamp,
            updated_at: timestamp,
        };
        state.applications.push(application.clone());
        Ok(application)
    }

    async fn update(&self, id: &str, data: UpdateApplicationData) -> DomainResult<Application> {
        let mut state = self.state.lock().unwrap();
        let application = state
            .applications
            .iter_mut()
            .find(|application| application.id == id)
            .ok_or_else(|| DomainError::internal(format!("no application {id:?} to update")))?;

        if let Some(company) = data.company {
            application.company = company;
        }
        if let Some(role) = data.role {
            application.role = role;
        }
        if let Some(status) = data.status {
            application.status = status;
        }
        if let Some(job_url) = data.job_url {
            application.job_url = job_url;
        }
        if let Some(location) = data.location {
            application.location = location;
        }
        if let Some(salary_range) = data.salary_range {
            application.salary_range = salary_range;
        }
        if let Some(description) = data.description {
            application.description = description;
        }
        if let Some(applied_at) = data.applied_at {
            application.applied_at = applied_at;
        }
        if let Some(starred) = data.starred {
            application.starred = starred;
        }
        if let Some(source) = data.source {
            application.source = source;
        }
        if let Some(follow_up_at) = data.follow_up_at {
            application.follow_up_at = follow_up_at;
        }
        if let Some(tags) = data.tags {
            application.tags = tags.into_iter().map(|tag| tag.name).collect();
        }
        if let Some(board_position) = data.board_position {
            application.board_position = board_position;
        }
        application.updated_at = now();
        Ok(application.clone())
    }

    async fn delete(&self, id: &str) -> DomainResult<()> {
        let mut state = self.state.lock().unwrap();
        let Some(position) = state.applications.iter().position(|a| a.id == id) else {
            return Ok(());
        };
        let deleted = state.applications.remove(position);
        if let Some(count) = state.application_counts.get_mut(&deleted.user_id) {
            *count = (*count - 1).max(0);
        }
        Ok(())
    }

    async fn find_due_for_reminder(&self) -> DomainResult<Vec<Application>> {
        let now = now();
        let due_by = now + TimeDelta::milliseconds(reminder_window_ms::DUE_WITHIN);
        let resend_threshold = now - TimeDelta::milliseconds(reminder_window_ms::RESEND_AFTER);
        Ok(self.matching(|application| {
            is_live(application)
                && application.follow_up_at.is_some_and(|at| at >= now && at <= due_by)
                && application.reminder_sent_at.is_none_or(|sent_at| sent_at <= resend_threshold)
        }))
    }

    async fn update_reminder_sent_at(&self, id: &str, sent_at: DateTime<Utc>) -> DomainResult<()> {
        self.modify(id, |application| {
            application.reminder_sent_at = Some(sent_at);
            application.updated_at = now();
        });
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::use_cases::errors::ErrorCode;
    use crate::use_cases::jobs::application_staleness::likely_ghosted_cutoff;
    use crate::use_cases::ports::ApplicationTagData;

    fn create_data(id: &str) -> CreateApplicationData {
        CreateApplicationData {
            id: id.to_string(),
            user_id: "user-1".to_string(),
            company: "Acme".to_string(),
            role: "Engineer".to_string(),
            status: ApplicationStatus::Draft,
            job_url: None,
            location: None,
            salary_range: None,
            description: None,
            starred: None,
            source: None,
            follow_up_at: None,
            tags: Vec::new(),
        }
    }

    fn created_at(seconds: i64, application: Application) -> Application {
        let at = DateTime::<Utc>::UNIX_EPOCH + TimeDelta::seconds(seconds);
        Application { created_at: at, ..application }
    }

    fn ids(applications: &[Application]) -> Vec<&str> {
        applications.iter().map(|application| application.id.as_str()).collect()
    }

    fn page(limit: i64, cursor: Option<&str>) -> FindApplicationsPagePagination {
        FindApplicationsPagePagination { cursor: cursor.map(str::to_string), limit }
    }

    #[tokio::test]
    async fn create_reserves_a_quota_slot_and_delete_gives_it_back() {
        let repository = FakeApplicationRepository::default();

        let created = repository
            .create(CreateApplicationData {
                tags: vec![ApplicationTagData { id: "t1".to_string(), name: "remote".to_string() }],
                ..create_data("app-1")
            })
            .await
            .unwrap();

        assert_eq!(created.tags, vec!["remote"]);
        assert_eq!(created.board_position, 0);
        assert_eq!(repository.application_count("user-1"), 1);

        repository.soft_delete("app-1", now()).await.unwrap();
        assert_eq!(repository.application_count("user-1"), 1);

        repository.delete("app-1").await.unwrap();
        assert_eq!(repository.application_count("user-1"), 0);
        assert_eq!(repository.find_by_id_including_trashed("app-1").await.unwrap(), None);
    }

    #[tokio::test]
    async fn create_at_the_limit_fails_with_the_quota_message_and_stores_nothing() {
        let repository = FakeApplicationRepository::default();
        repository.set_application_count("user-1", content_limits::APPLICATIONS_PER_USER);

        let err = repository.create(create_data("app-1")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::QuotaExceeded);
        assert_eq!(err.to_string(), "You have reached the maximum of 50 applications");
        assert!(repository.all().is_empty());
    }

    #[tokio::test]
    async fn pages_newest_first_without_gaps_even_when_created_at_ties() {
        let repository = FakeApplicationRepository::with(
            ["app-1", "app-2", "app-3", "app-4", "app-5"]
                .map(|id| application_owned_by(id, "user-1"))
                .to_vec(),
        );

        let mut seen = Vec::new();
        let mut cursor: Option<String> = None;
        loop {
            let found = repository
                .find_page_by_user_id("user-1", Default::default(), page(2, cursor.as_deref()))
                .await
                .unwrap();
            seen.extend(found.items.iter().map(|application| application.id.clone()));
            if !found.has_next_page {
                break;
            }
            cursor = found.items.last().map(|application| application.id.clone());
        }

        assert_eq!(seen, vec!["app-5", "app-4", "app-3", "app-2", "app-1"]);
    }

    #[tokio::test]
    async fn the_page_filters_match_the_query() {
        let stale = likely_ghosted_cutoff(now());
        let repository = FakeApplicationRepository::with(vec![
            Application {
                company: "Stripe".to_string(),
                starred: true,
                ..application_owned_by("starred", "user-1")
            },
            Application {
                description: Some("works with stripe".to_string()),
                status: ApplicationStatus::Draft,
                ..application_owned_by("described", "user-1")
            },
            Application {
                applied_at: Some(stale),
                updated_at: stale,
                ..application_owned_by("ghosted", "user-1")
            },
            Application {
                deleted_at: Some(now()),
                company: "Stripe".to_string(),
                ..application_owned_by("trashed", "user-1")
            },
            Application {
                company: "Stripe".to_string(),
                ..application_owned_by("foreign", "user-2")
            },
        ]);
        let find = |filters: FindApplicationsPageFilters| async {
            let found =
                repository.find_page_by_user_id("user-1", filters, page(10, None)).await.unwrap();
            let mut found: Vec<String> = found.items.into_iter().map(|a| a.id).collect();
            found.sort();
            found
        };

        let search = Some("  STRIPE ".to_string());
        assert_eq!(
            find(FindApplicationsPageFilters { search, ..Default::default() }).await,
            vec!["described", "starred"]
        );
        assert_eq!(
            find(FindApplicationsPageFilters { starred: Some(true), ..Default::default() }).await,
            vec!["starred"]
        );
        // `false` is no filter, as in the original.
        assert_eq!(
            find(FindApplicationsPageFilters { starred: Some(false), ..Default::default() })
                .await
                .len(),
            3
        );
        assert_eq!(
            find(FindApplicationsPageFilters { likely_ghosted: Some(true), ..Default::default() })
                .await,
            vec!["ghosted"]
        );
        assert_eq!(
            find(FindApplicationsPageFilters {
                status: Some(ApplicationStatus::Draft),
                ..Default::default()
            })
            .await,
            vec!["described"]
        );
    }

    #[tokio::test]
    async fn trash_hides_an_application_until_it_is_restored() {
        let repository = FakeApplicationRepository::with(vec![
            application_owned_by("live", "user-1"),
            application_owned_by("trashed", "user-1"),
        ]);
        let deleted_at = now();
        repository.soft_delete("trashed", deleted_at).await.unwrap();

        assert_eq!(repository.find_by_id("trashed").await.unwrap(), None);
        let listed = repository.find_all_by_user_id("user-1", Default::default()).await.unwrap();
        assert_eq!(ids(&listed), vec!["live"]);
        let trashed = repository.find_trashed_by_user_id("user-1").await.unwrap();
        assert_eq!(ids(&trashed), vec!["trashed"]);
        assert_eq!(trashed[0].deleted_at, Some(deleted_at));
        assert_eq!(ids(&repository.find_due_for_purge(deleted_at).await.unwrap()), vec!["trashed"]);
        let before = deleted_at - TimeDelta::milliseconds(1);
        assert!(repository.find_due_for_purge(before).await.unwrap().is_empty());

        repository.restore("trashed").await.unwrap();

        assert!(repository.find_by_id("trashed").await.unwrap().is_some());
        assert!(repository.find_trashed_by_user_id("user-1").await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn reorder_writes_indexes_to_the_scoped_column_only_and_keeps_updated_at() {
        let repository = FakeApplicationRepository::with(vec![
            created_at(1, application_owned_by("a", "user-1")),
            created_at(2, application_owned_by("b", "user-1")),
            application_owned_by("theirs", "user-2"),
            Application {
                status: ApplicationStatus::Offered,
                ..application_owned_by("elsewhere", "user-1")
            },
        ]);
        let order = ["theirs", "elsewhere", "a", "b"].map(str::to_string);

        let column =
            repository.reorder_board("user-1", ApplicationStatus::Applied, &order).await.unwrap();

        assert_eq!(ids(&column), vec!["a", "b"]);
        assert_eq!(column[0].board_position, 2);
        assert_eq!(column[0].updated_at, DateTime::<Utc>::UNIX_EPOCH);
        let untouched = repository.find_by_id("theirs").await.unwrap().unwrap();
        assert_eq!(untouched.board_position, 0);

        // Untouched cards tie at 0 and fall back to newest first.
        let fresh = FakeApplicationRepository::with(vec![
            created_at(1, application_owned_by("older", "user-1")),
            created_at(2, application_owned_by("newer", "user-1")),
        ]);
        let column = fresh.reorder_board("user-1", ApplicationStatus::Applied, &[]).await.unwrap();
        assert_eq!(ids(&column), vec!["newer", "older"]);
    }

    #[tokio::test]
    async fn update_writes_only_the_named_fields_and_can_null_a_column() {
        let repository = FakeApplicationRepository::with(vec![Application {
            job_url: Some("https://example.com".to_string()),
            tags: vec!["frontend".to_string()],
            ..application_owned_by("app-1", "user-1")
        }]);

        let updated = repository
            .update(
                "app-1",
                UpdateApplicationData {
                    role: Some("Staff Engineer".to_string()),
                    job_url: Some(None),
                    ..Default::default()
                },
            )
            .await
            .unwrap();

        assert_eq!(updated.role, "Staff Engineer");
        assert_eq!(updated.company, "Acme");
        assert_eq!(updated.job_url, None);
        assert_eq!(updated.tags, vec!["frontend"]);
        assert!(updated.updated_at > DateTime::<Utc>::UNIX_EPOCH);

        let missing = repository.update("missing", Default::default()).await;
        assert!(matches!(missing, Err(DomainError::Internal(_))));
    }

    #[tokio::test]
    async fn reminders_are_due_inside_the_window_unless_sent_recently_or_trashed() {
        let soon = now() + TimeDelta::hours(1);
        let due = |id: &str| Application {
            follow_up_at: Some(soon),
            ..application_owned_by(id, "user-1")
        };
        let repository = FakeApplicationRepository::with(vec![
            due("due"),
            Application { reminder_sent_at: Some(now()), ..due("just-reminded") },
            Application {
                reminder_sent_at: Some(now() - TimeDelta::hours(24)),
                ..due("reminded-yesterday")
            },
            Application { follow_up_at: Some(now() + TimeDelta::hours(25)), ..due("later") },
            Application { follow_up_at: Some(now() - TimeDelta::minutes(1)), ..due("past") },
            Application { deleted_at: Some(now()), ..due("trashed") },
            application_owned_by("no-follow-up", "user-1"),
        ]);

        let found = repository.find_due_for_reminder().await.unwrap();
        assert_eq!(ids(&found), vec!["due", "reminded-yesterday"]);

        repository.update_reminder_sent_at("due", now()).await.unwrap();
        let found = repository.find_due_for_reminder().await.unwrap();
        assert_eq!(ids(&found), vec!["reminded-yesterday"]);
    }

    #[test]
    fn ilike_ignores_case_and_honours_wildcards() {
        assert!(ilike("Stripe Inc", "%STRIPE%"));
        assert!(ilike("abc", "a_c"));
        assert!(!ilike("abc", "a_"));
        assert!(ilike("50% off", r"%50\% off%"));
        assert!(!ilike("500 off", r"%50\% off%"));
    }
}
