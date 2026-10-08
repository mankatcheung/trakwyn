//! The job-application data layer against a real Postgres: applications (with
//! tags, quota, Trash and the board), company briefings, contacts, interview
//! rounds and offers.

use chrono::{DateTime, TimeDelta, Utc};

use trakwyn_api::domain::application::{Application, ApplicationStatus};
use trakwyn_api::infrastructure::db::repositories::{
    PgApplicationRepository, PgCompanyBriefingRepository, PgContactRepository,
    PgInterviewRoundRepository, PgOfferRepository,
};
use trakwyn_api::infrastructure::db::Db;
use trakwyn_api::use_cases::clock::now;
use trakwyn_api::use_cases::constants::{content_limits, trash};
use trakwyn_api::use_cases::errors::{DomainError, DomainResult, ErrorCode};
use trakwyn_api::use_cases::ports::{
    ApplicationRepository, ApplicationTagData, CreateApplicationData, FindApplicationsFilters,
    FindApplicationsPageFilters, FindApplicationsPagePagination, UpdateApplicationData,
};

use crate::common::{seed_application, seed_user, TestDb};

const USER: &str = "u1";

async fn database() -> Db {
    let TestDb { db } = TestDb::create().await;
    seed_user(&db, USER).await;
    db
}

fn at(timestamp: &str) -> DateTime<Utc> {
    timestamp.parse().unwrap()
}

fn base_app(id: &str) -> CreateApplicationData {
    CreateApplicationData {
        id: id.to_string(),
        user_id: USER.to_string(),
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

fn tag(id: &str, name: &str) -> ApplicationTagData {
    ApplicationTagData { id: id.to_string(), name: name.to_string() }
}

fn ids(applications: &[Application]) -> Vec<&str> {
    applications.iter().map(|application| application.id.as_str()).collect()
}

fn sorted<T: Ord>(mut values: Vec<T>) -> Vec<T> {
    values.sort();
    values
}

async fn application_count(db: &Db, user_id: &str) -> i32 {
    sqlx::query_scalar(r#"SELECT "applicationCount" FROM "User" WHERE "id" = $1"#)
        .bind(user_id)
        .fetch_one(db.pool())
        .await
        .unwrap()
}

async fn set_application_count(db: &Db, user_id: &str, count: i32) {
    sqlx::query(r#"UPDATE "User" SET "applicationCount" = $2 WHERE "id" = $1"#)
        .bind(user_id)
        .bind(count)
        .execute(db.pool())
        .await
        .unwrap();
}

/// Sets one timestamp column of one application, bypassing the repository.
async fn set_timestamp(db: &Db, id: &str, column: &str, value: DateTime<Utc>) {
    sqlx::query(&format!(r#"UPDATE "JobApplication" SET "{column}" = $2 WHERE "id" = $1"#))
        .bind(id)
        .bind(value)
        .execute(db.pool())
        .await
        .unwrap();
}

async fn count_rows(db: &Db, table: &str) -> i64 {
    sqlx::query_scalar(&format!(r#"SELECT count(*) FROM "{table}""#))
        .fetch_one(db.pool())
        .await
        .unwrap()
}

async fn sleep_a_tick() {
    tokio::time::sleep(std::time::Duration::from_millis(5)).await;
}

mod applications {
    use super::*;

    fn page(limit: i64, cursor: Option<&str>) -> FindApplicationsPagePagination {
        FindApplicationsPagePagination { cursor: cursor.map(str::to_string), limit }
    }

    async fn find_page(
        repo: &PgApplicationRepository,
        filters: FindApplicationsPageFilters,
    ) -> Vec<String> {
        let found = repo.find_page_by_user_id(USER, filters, page(50, None)).await.unwrap();
        found.items.into_iter().map(|application| application.id).collect()
    }

    mod create {
        use super::*;

        #[tokio::test]
        async fn persists_an_application_and_returns_the_entity() {
            let db = database().await;
            let repo = PgApplicationRepository::new(db);

            let app = repo.create(base_app("app-1")).await.unwrap();

            assert_eq!(app.id, "app-1");
            assert_eq!(app.user_id, USER);
            assert_eq!(app.company, "Acme");
            assert_eq!(app.role, "Engineer");
            assert_eq!(app.status, ApplicationStatus::Draft);
            assert_eq!(app.job_url, None);
            assert_eq!(app.applied_at, None);
            assert!(!app.starred);
            assert_eq!(app.board_position, 0);
            assert_eq!(app.deleted_at, None);
            assert_eq!(app.reminder_sent_at, None);
            assert_eq!(app.created_at, app.updated_at);
            assert_eq!(app.tags, Vec::<String>::new());
            // What was returned is what is stored.
            assert_eq!(repo.find_by_id("app-1").await.unwrap(), Some(app));
        }

        #[tokio::test]
        async fn stores_every_optional_field() {
            let repo = PgApplicationRepository::new(database().await);
            let follow_up_at = at("2026-09-01T09:00:00Z");

            let app = repo
                .create(CreateApplicationData {
                    status: ApplicationStatus::Applied,
                    job_url: Some("https://example.com/job".to_string()),
                    location: Some("Remote".to_string()),
                    salary_range: Some("100-120k".to_string()),
                    description: Some("Build things".to_string()),
                    starred: Some(true),
                    source: Some("referral".to_string()),
                    follow_up_at: Some(follow_up_at),
                    ..base_app("app-1")
                })
                .await
                .unwrap();

            assert_eq!(app.status, ApplicationStatus::Applied);
            assert_eq!(app.job_url.as_deref(), Some("https://example.com/job"));
            assert_eq!(app.location.as_deref(), Some("Remote"));
            assert_eq!(app.salary_range.as_deref(), Some("100-120k"));
            assert_eq!(app.description.as_deref(), Some("Build things"));
            assert!(app.starred);
            assert_eq!(app.source.as_deref(), Some("referral"));
            assert_eq!(app.follow_up_at, Some(follow_up_at));
        }

        #[tokio::test]
        async fn reserves_a_quota_slot_and_touches_the_user() {
            let db = database().await;
            let before: DateTime<Utc> =
                sqlx::query_scalar(r#"SELECT "updatedAt" FROM "User" WHERE "id" = $1"#)
                    .bind(USER)
                    .fetch_one(db.pool())
                    .await
                    .unwrap();
            sleep_a_tick().await;
            let repo = PgApplicationRepository::new(db.clone());

            repo.create(base_app("app-1")).await.unwrap();
            repo.create(base_app("app-2")).await.unwrap();

            assert_eq!(application_count(&db, USER).await, 2);
            let after: DateTime<Utc> =
                sqlx::query_scalar(r#"SELECT "updatedAt" FROM "User" WHERE "id" = $1"#)
                    .bind(USER)
                    .fetch_one(db.pool())
                    .await
                    .unwrap();
            assert!(after > before);
        }

        #[tokio::test]
        async fn rejects_creation_at_the_per_user_limit_without_inserting_a_row() {
            let db = database().await;
            set_application_count(&db, USER, content_limits::APPLICATIONS_PER_USER).await;
            let repo = PgApplicationRepository::new(db.clone());

            let err = repo.create(base_app("app-1")).await.unwrap_err();

            assert_eq!(err.code(), ErrorCode::QuotaExceeded);
            assert_eq!(err.to_string(), "You have reached the maximum of 50 applications");
            assert_eq!(count_rows(&db, "JobApplication").await, 0);
            assert_eq!(application_count(&db, USER).await, content_limits::APPLICATIONS_PER_USER);
        }

        #[tokio::test]
        async fn accepts_the_last_slot_below_the_limit() {
            let db = database().await;
            set_application_count(&db, USER, content_limits::APPLICATIONS_PER_USER - 1).await;
            let repo = PgApplicationRepository::new(db.clone());

            repo.create(base_app("app-1")).await.unwrap();

            assert_eq!(application_count(&db, USER).await, content_limits::APPLICATIONS_PER_USER);
        }

        /// The reservation matches no row, which the original reports the
        /// same way as a full quota.
        #[tokio::test]
        async fn a_user_that_does_not_exist_reads_as_quota_exceeded() {
            let db = database().await;
            let repo = PgApplicationRepository::new(db.clone());

            let err = repo
                .create(CreateApplicationData { user_id: "ghost".to_string(), ..base_app("app-1") })
                .await
                .unwrap_err();

            assert_eq!(err.code(), ErrorCode::QuotaExceeded);
            assert_eq!(count_rows(&db, "JobApplication").await, 0);
        }

        #[tokio::test]
        async fn a_failed_insert_gives_the_reserved_slot_back() {
            let db = database().await;
            let repo = PgApplicationRepository::new(db.clone());
            repo.create(base_app("app-1")).await.unwrap();

            let duplicate = repo.create(base_app("app-1")).await;

            assert!(matches!(duplicate, Err(DomainError::Internal(_))));
            assert_eq!(application_count(&db, USER).await, 1);
        }

        #[tokio::test]
        async fn a_failed_tag_insert_rolls_the_application_back() {
            let db = database().await;
            let repo = PgApplicationRepository::new(db.clone());

            // The same name twice breaks the (applicationId, name) unique index.
            let result = repo
                .create(CreateApplicationData {
                    tags: vec![tag("tag-1", "remote"), tag("tag-2", "remote")],
                    ..base_app("app-1")
                })
                .await;

            assert!(matches!(result, Err(DomainError::Internal(_))));
            assert_eq!(count_rows(&db, "JobApplication").await, 0);
            assert_eq!(application_count(&db, USER).await, 0);
        }

        #[tokio::test]
        async fn joins_an_open_transaction_instead_of_committing_on_its_own() {
            let db = database().await;
            let repo = PgApplicationRepository::new(db.clone());

            let result: DomainResult<()> = db
                .transaction(|| async {
                    repo.create(base_app("app-1")).await?;
                    Err(DomainError::conflict("changed my mind"))
                })
                .await;

            assert!(result.is_err());
            assert_eq!(count_rows(&db, "JobApplication").await, 0);
            assert_eq!(application_count(&db, USER).await, 0);
        }
    }

    mod delete {
        use super::*;

        #[tokio::test]
        async fn removes_the_application() {
            let repo = PgApplicationRepository::new(database().await);
            repo.create(base_app("app-1")).await.unwrap();

            repo.delete("app-1").await.unwrap();

            assert_eq!(repo.find_by_id("app-1").await.unwrap(), None);
        }

        #[tokio::test]
        async fn frees_an_application_quota_slot_after_permanent_deletion() {
            let db = database().await;
            let repo = PgApplicationRepository::new(db.clone());
            repo.create(base_app("app-1")).await.unwrap();
            assert_eq!(application_count(&db, USER).await, 1);

            repo.delete("app-1").await.unwrap();

            assert_eq!(application_count(&db, USER).await, 0);
        }

        #[tokio::test]
        async fn never_takes_the_counter_below_zero() {
            let db = database().await;
            // Seeded without the repository, so the counter is still 0.
            seed_application(&db, "app-1", USER).await;
            let repo = PgApplicationRepository::new(db.clone());

            repo.delete("app-1").await.unwrap();

            assert_eq!(application_count(&db, USER).await, 0);
        }

        #[tokio::test]
        async fn an_unknown_id_changes_nothing() {
            let db = database().await;
            let repo = PgApplicationRepository::new(db.clone());
            repo.create(base_app("app-1")).await.unwrap();

            repo.delete("missing").await.unwrap();

            assert_eq!(application_count(&db, USER).await, 1);
            assert!(repo.find_by_id("app-1").await.unwrap().is_some());
        }

        #[tokio::test]
        async fn takes_the_tags_with_it() {
            let db = database().await;
            let repo = PgApplicationRepository::new(db.clone());
            repo.create(CreateApplicationData {
                tags: vec![tag("tag-1", "remote")],
                ..base_app("app-1")
            })
            .await
            .unwrap();

            repo.delete("app-1").await.unwrap();

            assert_eq!(count_rows(&db, "ApplicationTag").await, 0);
        }
    }

    #[tokio::test]
    async fn keeps_a_trashed_application_counted_until_permanent_deletion() {
        let db = database().await;
        let repo = PgApplicationRepository::new(db.clone());
        repo.create(base_app("app-1")).await.unwrap();

        repo.soft_delete("app-1", now()).await.unwrap();
        assert_eq!(application_count(&db, USER).await, 1);

        repo.restore("app-1").await.unwrap();
        assert_eq!(application_count(&db, USER).await, 1);
    }

    mod find_by_id {
        use super::*;

        #[tokio::test]
        async fn returns_the_application_when_it_exists() {
            let repo = PgApplicationRepository::new(database().await);
            repo.create(base_app("app-1")).await.unwrap();

            let found = repo.find_by_id("app-1").await.unwrap();

            assert_eq!(found.map(|application| application.id).as_deref(), Some("app-1"));
        }

        #[tokio::test]
        async fn returns_none_when_it_does_not_exist() {
            let repo = PgApplicationRepository::new(database().await);
            assert_eq!(repo.find_by_id("missing").await.unwrap(), None);
            assert_eq!(repo.find_by_id_including_trashed("missing").await.unwrap(), None);
        }
    }

    mod find_all_by_user_id {
        use super::*;

        async fn seeded() -> PgApplicationRepository {
            let repo = PgApplicationRepository::new(database().await);
            for (id, status) in [
                ("app-1", ApplicationStatus::Draft),
                ("app-2", ApplicationStatus::Applied),
                ("app-3", ApplicationStatus::Applied),
            ] {
                repo.create(CreateApplicationData { status, ..base_app(id) }).await.unwrap();
            }
            repo
        }

        #[tokio::test]
        async fn returns_all_applications_for_the_user_when_no_filter_is_given() {
            let repo = seeded().await;
            let apps = repo.find_all_by_user_id(USER, Default::default()).await.unwrap();
            assert_eq!(apps.len(), 3);
        }

        #[tokio::test]
        async fn filters_by_status() {
            let repo = seeded().await;
            let filters = FindApplicationsFilters { status: Some(ApplicationStatus::Applied) };

            let apps = repo.find_all_by_user_id(USER, filters).await.unwrap();

            assert_eq!(apps.len(), 2);
            assert!(apps.iter().all(|app| app.status == ApplicationStatus::Applied));
        }

        #[tokio::test]
        async fn returns_nothing_when_the_user_has_no_applications() {
            let repo = seeded().await;
            let apps = repo.find_all_by_user_id("other-user", Default::default()).await.unwrap();
            assert!(apps.is_empty());
        }

        #[tokio::test]
        async fn orders_results_newest_first() {
            let repo = seeded().await;
            let apps = repo.find_all_by_user_id(USER, Default::default()).await.unwrap();
            assert_eq!(ids(&apps), vec!["app-3", "app-2", "app-1"]);
        }

        #[tokio::test]
        async fn attaches_each_applications_own_tags() {
            let repo = PgApplicationRepository::new(database().await);
            repo.create(CreateApplicationData {
                tags: vec![tag("t1", "remote"), tag("t2", "fintech")],
                ..base_app("app-1")
            })
            .await
            .unwrap();
            repo.create(CreateApplicationData {
                tags: vec![tag("t3", "onsite")],
                ..base_app("app-2")
            })
            .await
            .unwrap();
            repo.create(base_app("app-3")).await.unwrap();

            let apps = repo.find_all_by_user_id(USER, Default::default()).await.unwrap();

            assert_eq!(ids(&apps), vec!["app-3", "app-2", "app-1"]);
            assert_eq!(apps[0].tags, Vec::<String>::new());
            assert_eq!(apps[1].tags, vec!["onsite"]);
            assert_eq!(sorted(apps[2].tags.clone()), vec!["fintech", "remote"]);
        }
    }

    mod find_page_by_user_id {
        use super::*;

        #[tokio::test]
        async fn paginates_through_a_full_result_set_with_no_gaps_or_duplicates_newest_first() {
            let repo = PgApplicationRepository::new(database().await);
            for index in 1..=5 {
                repo.create(base_app(&format!("app-{index}"))).await.unwrap();
            }

            let mut seen: Vec<String> = Vec::new();
            let mut cursor: Option<String> = None;
            for _ in 0..10 {
                let found = repo
                    .find_page_by_user_id(USER, Default::default(), page(2, cursor.as_deref()))
                    .await
                    .unwrap();
                seen.extend(found.items.iter().map(|app| app.id.clone()));
                if !found.has_next_page {
                    break;
                }
                cursor = found.items.last().map(|app| app.id.clone());
            }

            assert_eq!(seen, vec!["app-5", "app-4", "app-3", "app-2", "app-1"]);
        }

        #[tokio::test]
        async fn reports_has_next_page_correctly_on_the_last_page() {
            let repo = PgApplicationRepository::new(database().await);
            repo.create(base_app("app-1")).await.unwrap();
            repo.create(base_app("app-2")).await.unwrap();

            let first =
                repo.find_page_by_user_id(USER, Default::default(), page(2, None)).await.unwrap();

            assert_eq!(ids(&first.items), vec!["app-2", "app-1"]);
            assert!(!first.has_next_page);
        }

        #[tokio::test]
        async fn paginates_correctly_even_when_every_row_shares_the_same_created_at() {
            let db = database().await;
            let repo = PgApplicationRepository::new(db.clone());
            for index in 1..=4 {
                let id = format!("app-{index}");
                repo.create(base_app(&id)).await.unwrap();
                set_timestamp(&db, &id, "createdAt", at("2024-01-01T00:00:00Z")).await;
            }

            let first =
                repo.find_page_by_user_id(USER, Default::default(), page(2, None)).await.unwrap();
            assert_eq!(first.items.len(), 2);
            assert!(first.has_next_page);

            let cursor = first.items[1].id.clone();
            let second = repo
                .find_page_by_user_id(USER, Default::default(), page(2, Some(&cursor)))
                .await
                .unwrap();
            assert_eq!(second.items.len(), 2);
            assert!(!second.has_next_page);

            let all: Vec<String> =
                first.items.into_iter().chain(second.items).map(|app| app.id).collect();
            assert_eq!(sorted(all), vec!["app-1", "app-2", "app-3", "app-4"]);
        }

        #[tokio::test]
        async fn an_unknown_or_empty_cursor_starts_from_the_top() {
            let repo = PgApplicationRepository::new(database().await);
            repo.create(base_app("app-1")).await.unwrap();
            repo.create(base_app("app-2")).await.unwrap();

            for cursor in ["no-such-application", ""] {
                let found = repo
                    .find_page_by_user_id(USER, Default::default(), page(10, Some(cursor)))
                    .await
                    .unwrap();
                assert_eq!(ids(&found.items), vec!["app-2", "app-1"]);
            }
        }

        #[tokio::test]
        async fn filters_by_status() {
            let repo = PgApplicationRepository::new(database().await);
            repo.create(base_app("app-1")).await.unwrap();
            repo.create(CreateApplicationData {
                status: ApplicationStatus::Applied,
                ..base_app("app-2")
            })
            .await
            .unwrap();

            let filters = FindApplicationsPageFilters {
                status: Some(ApplicationStatus::Applied),
                ..Default::default()
            };

            assert_eq!(find_page(&repo, filters).await, vec!["app-2"]);
        }

        #[tokio::test]
        async fn filters_by_starred_only_when_asked_for_starred() {
            let repo = PgApplicationRepository::new(database().await);
            repo.create(CreateApplicationData { starred: Some(true), ..base_app("app-1") })
                .await
                .unwrap();
            repo.create(CreateApplicationData { starred: Some(false), ..base_app("app-2") })
                .await
                .unwrap();

            let starred = FindApplicationsPageFilters { starred: Some(true), ..Default::default() };
            assert_eq!(find_page(&repo, starred).await, vec!["app-1"]);

            // `false` is not "unstarred only": it is no filter at all.
            let unstarred =
                FindApplicationsPageFilters { starred: Some(false), ..Default::default() };
            assert_eq!(find_page(&repo, unstarred).await, vec!["app-2", "app-1"]);
        }

        #[tokio::test]
        async fn filters_by_a_case_insensitive_search_across_company_role_location_and_description()
        {
            let repo = PgApplicationRepository::new(database().await);
            let create = |data: CreateApplicationData| async { repo.create(data).await.unwrap() };
            create(CreateApplicationData { company: "Stripe".to_string(), ..base_app("app-1") })
                .await;
            create(CreateApplicationData {
                company: "Vercel".to_string(),
                role: "stripe-integrations".to_string(),
                ..base_app("app-2")
            })
            .await;
            create(CreateApplicationData {
                company: "Anthropic".to_string(),
                role: "Researcher".to_string(),
                ..base_app("app-3")
            })
            .await;
            create(CreateApplicationData {
                location: Some("Stripe HQ".to_string()),
                ..base_app("app-4")
            })
            .await;
            create(CreateApplicationData {
                description: Some("Payments on top of sTrIpE".to_string()),
                ..base_app("app-5")
            })
            .await;

            let search = |term: &str| FindApplicationsPageFilters {
                search: Some(term.to_string()),
                ..Default::default()
            };

            assert_eq!(
                sorted(find_page(&repo, search("STRIPE")).await),
                vec!["app-1", "app-2", "app-4", "app-5"]
            );
            // The term is trimmed, and a blank one is no filter.
            assert_eq!(sorted(find_page(&repo, search("  vercel ")).await), vec!["app-2"]);
            assert_eq!(find_page(&repo, search("   ")).await.len(), 5);
        }

        #[tokio::test]
        async fn filters_to_the_likely_ghosted() {
            let db = database().await;
            let repo = PgApplicationRepository::new(db.clone());
            let long_ago = now() - TimeDelta::days(15);
            let applied = |id: &str, status| CreateApplicationData { status, ..base_app(id) };
            for (id, status) in [
                ("ghosted", ApplicationStatus::Applied),
                ("ghosted-interviewing", ApplicationStatus::Interviewing),
                ("recently-touched", ApplicationStatus::Applied),
                ("recently-reminded", ApplicationStatus::Applied),
                ("reminded-long-ago", ApplicationStatus::Applied),
                ("never-applied", ApplicationStatus::Applied),
                ("rejected", ApplicationStatus::Rejected),
            ] {
                repo.create(applied(id, status)).await.unwrap();
                if id != "never-applied" {
                    set_timestamp(&db, id, "appliedAt", long_ago).await;
                }
                if id != "recently-touched" {
                    set_timestamp(&db, id, "updatedAt", long_ago).await;
                }
            }
            set_timestamp(&db, "recently-reminded", "reminderSentAt", now()).await;
            set_timestamp(&db, "reminded-long-ago", "reminderSentAt", long_ago).await;

            let filters =
                FindApplicationsPageFilters { likely_ghosted: Some(true), ..Default::default() };

            assert_eq!(
                sorted(find_page(&repo, filters).await),
                vec!["ghosted", "ghosted-interviewing", "reminded-long-ago"]
            );
        }

        #[tokio::test]
        async fn scopes_results_to_the_given_user() {
            let db = database().await;
            seed_user(&db, "u2").await;
            let repo = PgApplicationRepository::new(db);
            repo.create(base_app("app-1")).await.unwrap();
            repo.create(CreateApplicationData { user_id: "u2".to_string(), ..base_app("app-2") })
                .await
                .unwrap();

            assert_eq!(find_page(&repo, Default::default()).await, vec!["app-1"]);
        }
    }

    mod update {
        use super::*;

        #[tokio::test]
        async fn updates_only_the_provided_fields_and_moves_updated_at() {
            let repo = PgApplicationRepository::new(database().await);
            let created = repo.create(base_app("app-1")).await.unwrap();
            sleep_a_tick().await;

            let updated = repo
                .update(
                    "app-1",
                    UpdateApplicationData {
                        role: Some("Staff Engineer".to_string()),
                        ..Default::default()
                    },
                )
                .await
                .unwrap();

            assert_eq!(updated.role, "Staff Engineer");
            assert_eq!(updated.company, "Acme");
            assert_eq!(updated.created_at, created.created_at);
            assert!(updated.updated_at > created.updated_at);
            assert_eq!(repo.find_by_id("app-1").await.unwrap(), Some(updated));
        }

        #[tokio::test]
        async fn sets_applied_at_when_provided() {
            let repo = PgApplicationRepository::new(database().await);
            repo.create(base_app("app-1")).await.unwrap();
            let applied_at = at("2024-06-01T10:00:00Z");

            let updated = repo
                .update(
                    "app-1",
                    UpdateApplicationData {
                        status: Some(ApplicationStatus::Applied),
                        applied_at: Some(Some(applied_at)),
                        ..Default::default()
                    },
                )
                .await
                .unwrap();

            assert_eq!(updated.status, ApplicationStatus::Applied);
            assert_eq!(updated.applied_at, Some(applied_at));
        }

        #[tokio::test]
        async fn can_set_nullable_fields_to_null() {
            let repo = PgApplicationRepository::new(database().await);
            repo.create(CreateApplicationData {
                job_url: Some("https://example.com".to_string()),
                location: Some("Remote".to_string()),
                ..base_app("app-1")
            })
            .await
            .unwrap();

            let updated = repo
                .update(
                    "app-1",
                    UpdateApplicationData { job_url: Some(None), ..Default::default() },
                )
                .await
                .unwrap();

            assert_eq!(updated.job_url, None);
            assert_eq!(updated.location.as_deref(), Some("Remote"));
        }

        #[tokio::test]
        async fn writes_every_scalar_field() {
            let repo = PgApplicationRepository::new(database().await);
            repo.create(base_app("app-1")).await.unwrap();
            let follow_up_at = at("2026-09-01T09:00:00Z");

            let updated = repo
                .update(
                    "app-1",
                    UpdateApplicationData {
                        company: Some("Globex".to_string()),
                        role: Some("Designer".to_string()),
                        status: Some(ApplicationStatus::Offered),
                        job_url: Some(Some("https://example.com".to_string())),
                        location: Some(Some("Berlin".to_string())),
                        salary_range: Some(Some("90k".to_string())),
                        description: Some(Some("Design things".to_string())),
                        applied_at: Some(Some(follow_up_at)),
                        starred: Some(true),
                        source: Some(Some("linkedin".to_string())),
                        follow_up_at: Some(Some(follow_up_at)),
                        tags: None,
                        board_position: Some(4),
                    },
                )
                .await
                .unwrap();

            assert_eq!(updated.company, "Globex");
            assert_eq!(updated.role, "Designer");
            assert_eq!(updated.status, ApplicationStatus::Offered);
            assert_eq!(updated.job_url.as_deref(), Some("https://example.com"));
            assert_eq!(updated.location.as_deref(), Some("Berlin"));
            assert_eq!(updated.salary_range.as_deref(), Some("90k"));
            assert_eq!(updated.description.as_deref(), Some("Design things"));
            assert_eq!(updated.applied_at, Some(follow_up_at));
            assert!(updated.starred);
            assert_eq!(updated.source.as_deref(), Some("linkedin"));
            assert_eq!(updated.follow_up_at, Some(follow_up_at));
            assert_eq!(updated.board_position, 4);
        }

        #[tokio::test]
        async fn an_update_without_tags_returns_the_stored_ones() {
            let repo = PgApplicationRepository::new(database().await);
            repo.create(CreateApplicationData {
                tags: vec![tag("tag-1", "frontend")],
                ..base_app("app-1")
            })
            .await
            .unwrap();

            let updated = repo
                .update(
                    "app-1",
                    UpdateApplicationData { starred: Some(true), ..Default::default() },
                )
                .await
                .unwrap();

            assert_eq!(updated.tags, vec!["frontend"]);
        }

        #[tokio::test]
        async fn an_unknown_id_is_an_internal_error() {
            let repo = PgApplicationRepository::new(database().await);

            let scalar = repo
                .update(
                    "missing",
                    UpdateApplicationData { starred: Some(true), ..Default::default() },
                )
                .await;
            let tags = repo
                .update(
                    "missing",
                    UpdateApplicationData { tags: Some(Vec::new()), ..Default::default() },
                )
                .await;

            assert!(matches!(scalar, Err(DomainError::Internal(_))));
            assert!(matches!(tags, Err(DomainError::Internal(_))));
        }
    }

    mod tags {
        use super::*;

        #[tokio::test]
        async fn creates_an_application_with_tags() {
            let repo = PgApplicationRepository::new(database().await);

            let app = repo
                .create(CreateApplicationData {
                    tags: vec![tag("tag-1", "frontend"), tag("tag-2", "remote")],
                    ..base_app("app-1")
                })
                .await
                .unwrap();

            assert_eq!(app.tags, vec!["frontend", "remote"]);
            let stored = repo.find_by_id("app-1").await.unwrap().unwrap();
            assert_eq!(sorted(stored.tags), vec!["frontend", "remote"]);
        }

        #[tokio::test]
        async fn replaces_tags_on_update() {
            let repo = PgApplicationRepository::new(database().await);
            repo.create(CreateApplicationData {
                tags: vec![tag("tag-1", "frontend")],
                ..base_app("app-1")
            })
            .await
            .unwrap();

            let updated = repo
                .update(
                    "app-1",
                    UpdateApplicationData {
                        tags: Some(vec![tag("tag-2", "backend"), tag("tag-3", "fulltime")]),
                        ..Default::default()
                    },
                )
                .await
                .unwrap();

            assert_eq!(updated.tags, vec!["backend", "fulltime"]);
            let stored = repo.find_by_id("app-1").await.unwrap().unwrap();
            assert_eq!(sorted(stored.tags), vec!["backend", "fulltime"]);
        }

        #[tokio::test]
        async fn a_tags_only_update_still_moves_updated_at_and_can_carry_scalars() {
            let repo = PgApplicationRepository::new(database().await);
            let created = repo.create(base_app("app-1")).await.unwrap();
            sleep_a_tick().await;

            let updated = repo
                .update(
                    "app-1",
                    UpdateApplicationData {
                        tags: Some(vec![tag("tag-1", "remote")]),
                        ..Default::default()
                    },
                )
                .await
                .unwrap();
            assert!(updated.updated_at > created.updated_at);
            assert_eq!(updated.company, "Acme");

            let renamed = repo
                .update(
                    "app-1",
                    UpdateApplicationData {
                        company: Some("Globex".to_string()),
                        tags: Some(vec![tag("tag-2", "onsite")]),
                        ..Default::default()
                    },
                )
                .await
                .unwrap();
            assert_eq!(renamed.company, "Globex");
            assert_eq!(renamed.tags, vec!["onsite"]);
        }

        #[tokio::test]
        async fn an_empty_tag_list_clears_them() {
            let db = database().await;
            let repo = PgApplicationRepository::new(db.clone());
            repo.create(CreateApplicationData {
                tags: vec![tag("tag-1", "frontend")],
                ..base_app("app-1")
            })
            .await
            .unwrap();

            let updated = repo
                .update(
                    "app-1",
                    UpdateApplicationData { tags: Some(Vec::new()), ..Default::default() },
                )
                .await
                .unwrap();

            assert_eq!(updated.tags, Vec::<String>::new());
            assert_eq!(count_rows(&db, "ApplicationTag").await, 0);
        }

        #[tokio::test]
        async fn a_failed_tag_replacement_leaves_the_application_as_it_was() {
            let repo = PgApplicationRepository::new(database().await);
            repo.create(CreateApplicationData {
                tags: vec![tag("tag-1", "frontend")],
                ..base_app("app-1")
            })
            .await
            .unwrap();

            let result = repo
                .update(
                    "app-1",
                    UpdateApplicationData {
                        company: Some("Globex".to_string()),
                        tags: Some(vec![tag("tag-2", "same"), tag("tag-3", "same")]),
                        ..Default::default()
                    },
                )
                .await;

            assert!(matches!(result, Err(DomainError::Internal(_))));
            let stored = repo.find_by_id("app-1").await.unwrap().unwrap();
            assert_eq!(stored.company, "Acme");
            assert_eq!(stored.tags, vec!["frontend"]);
        }

        #[tokio::test]
        async fn returns_no_tags_when_none_are_set() {
            let repo = PgApplicationRepository::new(database().await);
            let app = repo.create(base_app("app-1")).await.unwrap();
            assert_eq!(app.tags, Vec::<String>::new());
        }
    }

    mod reorder_board {
        use super::*;

        struct Card<'a> {
            id: &'a str,
            user_id: &'a str,
            status: ApplicationStatus,
            deleted_at: Option<DateTime<Utc>>,
            created_at: DateTime<Utc>,
        }

        fn card(id: &str) -> Card<'_> {
            Card {
                id,
                user_id: USER,
                status: ApplicationStatus::Applied,
                deleted_at: None,
                created_at: at("2024-01-01T00:00:00Z"),
            }
        }

        async fn board(cards: &[Card<'_>]) -> Db {
            let db = database().await;
            seed_user(&db, "u2").await;
            for card in cards {
                sqlx::query(
                    r#"INSERT INTO "JobApplication"
                         ("id", "userId", "company", "role", "status", "deletedAt", "createdAt",
                          "updatedAt")
                       VALUES ($1, $2, 'Acme', 'Engineer', $3, $4, $5, $6)"#,
                )
                .bind(card.id)
                .bind(card.user_id)
                .bind(card.status.as_str())
                .bind(card.deleted_at)
                .bind(card.created_at)
                .bind(at("2024-01-01T00:00:00Z"))
                .execute(db.pool())
                .await
                .unwrap();
            }
            db
        }

        async fn position(db: &Db, id: &str) -> i32 {
            sqlx::query_scalar(r#"SELECT "boardPosition" FROM "JobApplication" WHERE "id" = $1"#)
                .bind(id)
                .fetch_one(db.pool())
                .await
                .unwrap()
        }

        async fn reorder(db: &Db, order: &[&str]) -> Vec<String> {
            let order: Vec<String> = order.iter().map(|id| id.to_string()).collect();
            let column = PgApplicationRepository::new(db.clone())
                .reorder_board(USER, ApplicationStatus::Applied, &order)
                .await
                .unwrap();
            column.into_iter().map(|application| application.id).collect()
        }

        #[tokio::test]
        async fn writes_zero_to_n_in_the_given_order_and_returns_the_column_in_it() {
            let db = board(&[card("a"), card("b"), card("c")]).await;

            let column = reorder(&db, &["c", "a", "b"]).await;

            assert_eq!(position(&db, "c").await, 0);
            assert_eq!(position(&db, "a").await, 1);
            assert_eq!(position(&db, "b").await, 2);
            assert_eq!(column, vec!["c", "a", "b"]);
        }

        #[tokio::test]
        async fn defaults_every_row_to_zero_so_an_untouched_board_keeps_its_created_at_order() {
            let db = board(&[
                Card { created_at: at("2024-01-01T00:00:00Z"), ..card("older") },
                Card { created_at: at("2024-05-01T00:00:00Z"), ..card("newer") },
            ])
            .await;
            assert_eq!(position(&db, "older").await, 0);
            assert_eq!(position(&db, "newer").await, 0);

            let column = reorder(&db, &[]).await;

            assert_eq!(column, vec!["newer", "older"]);
        }

        #[tokio::test]
        async fn leaves_another_users_cards_alone() {
            let db = board(&[card("mine"), Card { user_id: "u2", ..card("theirs") }]).await;

            reorder(&db, &["theirs", "mine"]).await;

            // 'theirs' matches no row scoped to the user, so only 'mine' is
            // written, and it takes index 1 because that is where it was put.
            assert_eq!(position(&db, "theirs").await, 0);
            assert_eq!(position(&db, "mine").await, 1);
        }

        #[tokio::test]
        async fn leaves_cards_in_another_column_alone() {
            let db = board(&[
                card("a"),
                Card { status: ApplicationStatus::Offered, ..card("elsewhere") },
            ])
            .await;

            reorder(&db, &["elsewhere", "a"]).await;

            assert_eq!(position(&db, "elsewhere").await, 0);
            assert_eq!(position(&db, "a").await, 1);
        }

        #[tokio::test]
        async fn skips_trashed_cards_and_omits_them_from_the_returned_column() {
            let db = board(&[
                card("a"),
                Card { deleted_at: Some(at("2024-06-01T00:00:00Z")), ..card("trashed") },
            ])
            .await;

            let column = reorder(&db, &["trashed", "a"]).await;

            assert_eq!(position(&db, "trashed").await, 0);
            assert_eq!(column, vec!["a"]);
        }

        #[tokio::test]
        async fn does_not_bump_updated_at() {
            // `is_likely_ghosted` reads updatedAt. If a reorder moved it,
            // dragging one card would clear the ghosted badge from every card
            // in the column.
            let db = board(&[card("a"), card("b")]).await;
            let repo = PgApplicationRepository::new(db.clone());
            let before = repo.find_by_id("a").await.unwrap().unwrap();

            reorder(&db, &["b", "a"]).await;

            let after = repo.find_by_id("a").await.unwrap().unwrap();
            assert_eq!(after.updated_at, before.updated_at);
            assert_eq!(after.board_position, 1);
        }

        #[tokio::test]
        async fn reads_the_column_back_without_writing_when_given_an_empty_list() {
            let db = board(&[card("a")]).await;

            let column = reorder(&db, &[]).await;

            assert_eq!(column, vec!["a"]);
            assert_eq!(position(&db, "a").await, 0);
        }

        #[tokio::test]
        async fn cards_left_out_keep_their_position_and_sort_among_the_rest() {
            let db = board(&[
                Card { created_at: at("2024-01-01T00:00:00Z"), ..card("a") },
                Card { created_at: at("2024-02-01T00:00:00Z"), ..card("b") },
                Card { created_at: at("2024-03-01T00:00:00Z"), ..card("left-out") },
            ])
            .await;

            let column = reorder(&db, &["a", "b"]).await;

            // 'left-out' stays at 0 and ties with 'a'; the newer one leads.
            assert_eq!(column, vec!["left-out", "a", "b"]);
        }
    }

    /// A trashed application must be invisible to every read except the ones
    /// that exist to see it. The filter lives in the repository so that holds
    /// for callers nobody thought about.
    mod trashed {
        use super::*;

        fn trashed_at() -> DateTime<Utc> {
            at("2026-08-20T12:00:00Z")
        }

        async fn seeded() -> (Db, PgApplicationRepository) {
            let db = database().await;
            let repo = PgApplicationRepository::new(db.clone());
            for id in ["live", "trashed"] {
                repo.create(CreateApplicationData {
                    status: ApplicationStatus::Applied,
                    ..base_app(id)
                })
                .await
                .unwrap();
            }
            repo.soft_delete("trashed", trashed_at()).await.unwrap();
            (db, repo)
        }

        #[tokio::test]
        async fn find_all_by_user_id_excludes_it_with_and_without_a_status_filter() {
            let (_, repo) = seeded().await;

            let all = repo.find_all_by_user_id(USER, Default::default()).await.unwrap();
            assert_eq!(ids(&all), vec!["live"]);

            let filters = FindApplicationsFilters { status: Some(ApplicationStatus::Applied) };
            let applied = repo.find_all_by_user_id(USER, filters).await.unwrap();
            assert_eq!(ids(&applied), vec!["live"]);
        }

        #[tokio::test]
        async fn find_page_by_user_id_excludes_it_from_a_search_as_well() {
            let (_, repo) = seeded().await;

            assert_eq!(find_page(&repo, Default::default()).await, vec!["live"]);
            let search = FindApplicationsPageFilters {
                search: Some("Acme".to_string()),
                ..Default::default()
            };
            assert_eq!(find_page(&repo, search).await, vec!["live"]);
        }

        #[tokio::test]
        async fn find_by_id_refuses_it() {
            let (_, repo) = seeded().await;
            assert_eq!(repo.find_by_id("trashed").await.unwrap(), None);
            assert!(repo.find_by_id("live").await.unwrap().is_some());
        }

        #[tokio::test]
        async fn find_due_for_reminder_skips_it_so_trash_stops_generating_follow_up_email() {
            let (_, repo) = seeded().await;
            let due = Some(Some(now() + TimeDelta::hours(1)));
            for id in ["live", "trashed"] {
                repo.update(id, UpdateApplicationData { follow_up_at: due, ..Default::default() })
                    .await
                    .unwrap();
            }

            let found = repo.find_due_for_reminder().await.unwrap();

            assert_eq!(ids(&found), vec!["live"]);
        }

        #[tokio::test]
        async fn find_trashed_by_user_id_shows_only_the_trashed_ones() {
            let (_, repo) = seeded().await;

            let found = repo.find_trashed_by_user_id(USER).await.unwrap();

            assert_eq!(ids(&found), vec!["trashed"]);
            assert_eq!(found[0].deleted_at, Some(trashed_at()));
        }

        #[tokio::test]
        async fn find_trashed_by_user_id_lists_the_most_recently_trashed_first() {
            let (db, repo) = seeded().await;
            seed_user(&db, "u2").await;
            for (id, user_id) in [("older", USER), ("tied", USER), ("foreign", "u2")] {
                repo.create(CreateApplicationData { user_id: user_id.to_string(), ..base_app(id) })
                    .await
                    .unwrap();
            }
            repo.soft_delete("older", trashed_at() - TimeDelta::days(1)).await.unwrap();
            repo.soft_delete("tied", trashed_at()).await.unwrap();
            repo.soft_delete("foreign", trashed_at()).await.unwrap();

            let found = repo.find_trashed_by_user_id(USER).await.unwrap();

            // 'trashed' and 'tied' share a deletedAt; the id breaks the tie.
            assert_eq!(ids(&found), vec!["trashed", "tied", "older"]);
        }

        #[tokio::test]
        async fn find_by_id_including_trashed_is_the_deliberate_exception() {
            let (_, repo) = seeded().await;

            let found = repo.find_by_id_including_trashed("trashed").await.unwrap().unwrap();

            assert_eq!(found.id, "trashed");
            assert_eq!(found.deleted_at, Some(trashed_at()));
            assert!(repo.find_by_id_including_trashed("live").await.unwrap().is_some());
        }

        #[tokio::test]
        async fn restore_brings_it_back_everywhere_at_once() {
            let (_, repo) = seeded().await;

            repo.restore("trashed").await.unwrap();

            assert!(repo.find_by_id("trashed").await.unwrap().is_some());
            let all = repo.find_all_by_user_id(USER, Default::default()).await.unwrap();
            assert_eq!(sorted(ids(&all)), vec!["live", "trashed"]);
            assert!(repo.find_trashed_by_user_id(USER).await.unwrap().is_empty());
        }

        #[tokio::test]
        async fn soft_delete_and_restore_touch_updated_at_as_drizzle_on_update_does() {
            let db = database().await;
            let repo = PgApplicationRepository::new(db.clone());
            repo.create(base_app("app-1")).await.unwrap();
            let long_ago = at("2024-01-01T00:00:00Z");

            set_timestamp(&db, "app-1", "updatedAt", long_ago).await;
            repo.soft_delete("app-1", trashed_at()).await.unwrap();
            let trashed = repo.find_by_id_including_trashed("app-1").await.unwrap().unwrap();
            assert!(trashed.updated_at > long_ago);

            set_timestamp(&db, "app-1", "updatedAt", long_ago).await;
            repo.restore("app-1").await.unwrap();
            let restored = repo.find_by_id("app-1").await.unwrap().unwrap();
            assert!(restored.updated_at > long_ago);
        }

        #[tokio::test]
        async fn find_due_for_purge_returns_only_what_has_sat_past_the_window() {
            let (_, repo) = seeded().await;
            let retention = TimeDelta::milliseconds(trash::RETENTION_MS);
            for (id, deleted_at) in [
                ("deleted-long-ago", trashed_at() - retention - TimeDelta::seconds(1)),
                ("deleted-on-the-cutoff", trashed_at() - retention),
            ] {
                repo.create(base_app(id)).await.unwrap();
                repo.soft_delete(id, deleted_at).await.unwrap();
            }

            // 'trashed' went into Trash at `trashed_at`, so it has served none
            // of its window; 'live' was never trashed.
            let due = repo.find_due_for_purge(trashed_at() - retention).await.unwrap();

            assert_eq!(sorted(ids(&due)), vec!["deleted-long-ago", "deleted-on-the-cutoff"]);
        }

        #[tokio::test]
        async fn delete_still_removes_the_row_outright_for_purge_and_account_deletion() {
            let (_, repo) = seeded().await;

            repo.delete("trashed").await.unwrap();

            assert_eq!(repo.find_by_id_including_trashed("trashed").await.unwrap(), None);
        }
    }

    mod reminders {
        use super::*;

        async fn with_follow_up(repo: &PgApplicationRepository, id: &str, offset: TimeDelta) {
            repo.create(CreateApplicationData {
                follow_up_at: Some(now() + offset),
                ..base_app(id)
            })
            .await
            .unwrap();
        }

        #[tokio::test]
        async fn finds_follow_ups_due_within_the_next_day() {
            let repo = PgApplicationRepository::new(database().await);
            with_follow_up(&repo, "in-an-hour", TimeDelta::hours(1)).await;
            with_follow_up(&repo, "in-23-hours", TimeDelta::hours(23)).await;
            with_follow_up(&repo, "in-25-hours", TimeDelta::hours(25)).await;
            with_follow_up(&repo, "a-minute-ago", TimeDelta::minutes(-1)).await;
            repo.create(base_app("no-follow-up")).await.unwrap();

            let found = repo.find_due_for_reminder().await.unwrap();

            assert_eq!(sorted(ids(&found)), vec!["in-23-hours", "in-an-hour"]);
        }

        #[tokio::test]
        async fn skips_one_reminded_within_the_resend_window() {
            let repo = PgApplicationRepository::new(database().await);
            with_follow_up(&repo, "just-reminded", TimeDelta::hours(1)).await;
            with_follow_up(&repo, "reminded-22h-ago", TimeDelta::hours(1)).await;
            with_follow_up(&repo, "reminded-24h-ago", TimeDelta::hours(1)).await;

            let sent_at = now();
            repo.update_reminder_sent_at("just-reminded", sent_at).await.unwrap();
            repo.update_reminder_sent_at("reminded-22h-ago", now() - TimeDelta::hours(22))
                .await
                .unwrap();
            repo.update_reminder_sent_at("reminded-24h-ago", now() - TimeDelta::hours(24))
                .await
                .unwrap();

            let found = repo.find_due_for_reminder().await.unwrap();

            assert_eq!(ids(&found), vec!["reminded-24h-ago"]);
            let reminded = repo.find_by_id("just-reminded").await.unwrap().unwrap();
            assert_eq!(reminded.reminder_sent_at, Some(sent_at));
        }

        #[tokio::test]
        async fn recording_a_reminder_touches_updated_at_as_drizzle_on_update_does() {
            let db = database().await;
            let repo = PgApplicationRepository::new(db.clone());
            repo.create(base_app("app-1")).await.unwrap();
            let long_ago = at("2024-01-01T00:00:00Z");
            set_timestamp(&db, "app-1", "updatedAt", long_ago).await;

            repo.update_reminder_sent_at("app-1", now()).await.unwrap();

            let reminded = repo.find_by_id("app-1").await.unwrap().unwrap();
            assert!(reminded.updated_at > long_ago);
        }
    }

    #[tokio::test]
    async fn a_stored_status_this_build_does_not_know_is_an_error() {
        let db = database().await;
        seed_application(&db, "app-1", USER).await;
        sqlx::query(r#"UPDATE "JobApplication" SET "status" = 'ghosted' WHERE "id" = 'app-1'"#)
            .execute(db.pool())
            .await
            .unwrap();

        let found = PgApplicationRepository::new(db).find_by_id("app-1").await;

        assert!(matches!(found, Err(DomainError::Internal(_))));
    }
}

/// A user with two applications, `app-1` and `app-2`.
async fn with_applications() -> Db {
    let db = database().await;
    seed_application(&db, "app-1", USER).await;
    seed_application(&db, "app-2", USER).await;
    db
}

async fn delete_application(db: &Db, id: &str) {
    sqlx::query(r#"DELETE FROM "JobApplication" WHERE "id" = $1"#)
        .bind(id)
        .execute(db.pool())
        .await
        .unwrap();
}

/// Rewrites `createdAt` on one row of a child table.
async fn set_created_at(db: &Db, table: &str, id: &str, value: DateTime<Utc>) {
    sqlx::query(&format!(r#"UPDATE "{table}" SET "createdAt" = $2 WHERE "id" = $1"#))
        .bind(id)
        .bind(value)
        .execute(db.pool())
        .await
        .unwrap();
}

mod company_briefings {
    use super::*;
    use trakwyn_api::use_cases::ports::{CompanyBriefingRepository, UpsertCompanyBriefingData};

    fn briefing(id: &str, application_id: &str, content: &str) -> UpsertCompanyBriefingData {
        UpsertCompanyBriefingData {
            id: id.to_string(),
            application_id: application_id.to_string(),
            content: content.to_string(),
            generated_at: at("2026-08-01T00:00:00Z"),
        }
    }

    #[tokio::test]
    async fn returns_none_when_nothing_has_been_generated() {
        let repo = PgCompanyBriefingRepository::new(with_applications().await);
        assert_eq!(repo.find_by_application_id("app-1").await.unwrap(), None);
    }

    #[tokio::test]
    async fn stores_and_reads_back_a_briefing() {
        let repo = PgCompanyBriefingRepository::new(with_applications().await);

        let stored = repo.upsert(briefing("b1", "app-1", "Overview…")).await.unwrap();

        assert_eq!(stored.id, "b1");
        assert_eq!(stored.application_id, "app-1");
        assert_eq!(stored.content, "Overview…");
        assert_eq!(stored.generated_at, at("2026-08-01T00:00:00Z"));
        assert_eq!(repo.find_by_application_id("app-1").await.unwrap(), Some(stored));
    }

    #[tokio::test]
    async fn regenerating_replaces_the_row_instead_of_adding_a_second_one() {
        let db = with_applications().await;
        let repo = PgCompanyBriefingRepository::new(db.clone());
        repo.upsert(briefing("b1", "app-1", "First")).await.unwrap();

        // A regenerate arrives with a fresh id: the conflict target is
        // applicationId, so it must replace rather than collide or duplicate.
        let second = repo
            .upsert(UpsertCompanyBriefingData {
                generated_at: at("2026-08-02T00:00:00Z"),
                ..briefing("b2", "app-1", "Second")
            })
            .await
            .unwrap();

        assert_eq!(count_rows(&db, "CompanyBriefing").await, 1);
        assert_eq!(second.content, "Second");
        assert_eq!(second.generated_at, at("2026-08-02T00:00:00Z"));
        // The row that was already there keeps its id.
        assert_eq!(second.id, "b1");
    }

    #[tokio::test]
    async fn keeps_briefings_for_different_applications_apart() {
        let repo = PgCompanyBriefingRepository::new(with_applications().await);
        repo.upsert(briefing("b1", "app-1", "Acme")).await.unwrap();
        repo.upsert(briefing("b2", "app-2", "Globex")).await.unwrap();

        let content = |found: Option<trakwyn_api::domain::company_briefing::CompanyBriefing>| {
            found.map(|briefing| briefing.content)
        };
        assert_eq!(
            content(repo.find_by_application_id("app-1").await.unwrap()).as_deref(),
            Some("Acme")
        );
        assert_eq!(
            content(repo.find_by_application_id("app-2").await.unwrap()).as_deref(),
            Some("Globex")
        );
    }

    #[tokio::test]
    async fn goes_with_the_application_when_it_is_deleted() {
        let db = with_applications().await;
        let repo = PgCompanyBriefingRepository::new(db.clone());
        repo.upsert(briefing("b1", "app-2", "Globex")).await.unwrap();

        delete_application(&db, "app-2").await;

        assert_eq!(repo.find_by_application_id("app-2").await.unwrap(), None);
    }
}

mod contacts {
    use super::*;
    use trakwyn_api::use_cases::ports::{ContactRepository, CreateContactData, UpdateContactData};

    fn contact(id: &str) -> CreateContactData {
        CreateContactData {
            id: id.to_string(),
            application_id: "app-1".to_string(),
            name: "Jane Doe".to_string(),
            ..Default::default()
        }
    }

    #[tokio::test]
    async fn persists_a_contact_and_returns_the_entity() {
        let repo = PgContactRepository::new(with_applications().await);

        let created = repo
            .create(CreateContactData {
                role: Some("Recruiter".to_string()),
                email: Some("jane@example.com".to_string()),
                phone: Some("+44 20 7946 0000".to_string()),
                linkedin_url: Some("https://linkedin.com/in/jane".to_string()),
                notes: Some("Met at a meetup".to_string()),
                ..contact("c1")
            })
            .await
            .unwrap();

        assert_eq!(created.id, "c1");
        assert_eq!(created.application_id, "app-1");
        assert_eq!(created.name, "Jane Doe");
        assert_eq!(created.role.as_deref(), Some("Recruiter"));
        assert_eq!(created.email.as_deref(), Some("jane@example.com"));
        assert_eq!(created.phone.as_deref(), Some("+44 20 7946 0000"));
        assert_eq!(created.linkedin_url.as_deref(), Some("https://linkedin.com/in/jane"));
        assert_eq!(created.notes.as_deref(), Some("Met at a meetup"));
        assert_eq!(created.created_at, created.updated_at);
        assert_eq!(repo.find_by_id("c1").await.unwrap(), Some(created));
    }

    #[tokio::test]
    async fn defaults_optional_fields_to_null_when_omitted() {
        let repo = PgContactRepository::new(with_applications().await);

        let created = repo.create(contact("c1")).await.unwrap();

        assert_eq!(created.role, None);
        assert_eq!(created.email, None);
        assert_eq!(created.phone, None);
        assert_eq!(created.linkedin_url, None);
        assert_eq!(created.notes, None);
    }

    #[tokio::test]
    async fn find_by_id_returns_none_when_not_found() {
        let repo = PgContactRepository::new(with_applications().await);
        assert_eq!(repo.find_by_id("missing").await.unwrap(), None);
    }

    #[tokio::test]
    async fn lists_and_counts_an_applications_contacts_oldest_first() {
        let db = with_applications().await;
        let repo = PgContactRepository::new(db.clone());
        // Created newest first, so only the ORDER BY can put them right.
        repo.create(contact("c2")).await.unwrap();
        repo.create(contact("c1")).await.unwrap();
        repo.create(CreateContactData { application_id: "app-2".to_string(), ..contact("c3") })
            .await
            .unwrap();
        set_created_at(&db, "Contact", "c1", at("2024-01-01T00:00:00Z")).await;
        set_created_at(&db, "Contact", "c2", at("2024-01-02T00:00:00Z")).await;

        let contacts = repo.find_all_by_application_id("app-1").await.unwrap();

        let listed: Vec<&str> = contacts.iter().map(|contact| contact.id.as_str()).collect();
        assert_eq!(listed, vec!["c1", "c2"]);
        assert_eq!(repo.count_by_application_id("app-1").await.unwrap(), 2);
        assert_eq!(repo.count_by_application_id("app-2").await.unwrap(), 1);
    }

    #[tokio::test]
    async fn lists_and_counts_nothing_when_there_are_no_contacts() {
        let repo = PgContactRepository::new(with_applications().await);
        assert!(repo.find_all_by_application_id("app-1").await.unwrap().is_empty());
        assert_eq!(repo.count_by_application_id("app-1").await.unwrap(), 0);
    }

    #[tokio::test]
    async fn updates_only_the_provided_fields_and_moves_updated_at() {
        let repo = PgContactRepository::new(with_applications().await);
        let created = repo
            .create(CreateContactData {
                role: Some("Recruiter".to_string()),
                email: Some("jane@example.com".to_string()),
                ..contact("c1")
            })
            .await
            .unwrap();
        sleep_a_tick().await;

        let updated = repo
            .update(
                "c1",
                UpdateContactData {
                    role: Some(Some("Hiring Manager".to_string())),
                    email: Some(None),
                    ..Default::default()
                },
            )
            .await
            .unwrap();

        assert_eq!(updated.role.as_deref(), Some("Hiring Manager"));
        assert_eq!(updated.email, None);
        assert_eq!(updated.name, "Jane Doe");
        assert!(updated.updated_at > created.updated_at);
        assert_eq!(repo.find_by_id("c1").await.unwrap(), Some(updated));
    }

    #[tokio::test]
    async fn writes_every_field() {
        let repo = PgContactRepository::new(with_applications().await);
        repo.create(contact("c1")).await.unwrap();

        let updated = repo
            .update(
                "c1",
                UpdateContactData {
                    name: Some("John Roe".to_string()),
                    role: Some(Some("CTO".to_string())),
                    email: Some(Some("john@example.com".to_string())),
                    phone: Some(Some("555".to_string())),
                    linkedin_url: Some(Some("https://linkedin.com/in/john".to_string())),
                    notes: Some(Some("Prefers email".to_string())),
                },
            )
            .await
            .unwrap();

        assert_eq!(updated.name, "John Roe");
        assert_eq!(updated.role.as_deref(), Some("CTO"));
        assert_eq!(updated.email.as_deref(), Some("john@example.com"));
        assert_eq!(updated.phone.as_deref(), Some("555"));
        assert_eq!(updated.linkedin_url.as_deref(), Some("https://linkedin.com/in/john"));
        assert_eq!(updated.notes.as_deref(), Some("Prefers email"));
    }

    #[tokio::test]
    async fn updating_an_unknown_contact_is_an_internal_error() {
        let repo = PgContactRepository::new(with_applications().await);
        let result = repo.update("missing", Default::default()).await;
        assert!(matches!(result, Err(DomainError::Internal(_))));
    }

    #[tokio::test]
    async fn removes_the_contact() {
        let repo = PgContactRepository::new(with_applications().await);
        repo.create(contact("c1")).await.unwrap();

        repo.delete("c1", "app-1").await.unwrap();

        assert_eq!(repo.find_by_id("c1").await.unwrap(), None);
    }

    #[tokio::test]
    async fn goes_with_the_application_when_it_is_deleted() {
        let db = with_applications().await;
        let repo = PgContactRepository::new(db.clone());
        repo.create(contact("c1")).await.unwrap();

        delete_application(&db, "app-1").await;

        assert_eq!(repo.find_by_id("c1").await.unwrap(), None);
    }
}

mod interview_rounds {
    use super::*;
    use trakwyn_api::domain::interview_round::{
        InterviewRound, InterviewRoundOutcome, InterviewRoundType,
    };
    use trakwyn_api::use_cases::ports::{
        CreateInterviewRoundData, InterviewRoundRepository, UpdateInterviewRoundData,
    };

    fn round(id: &str, application_id: &str) -> CreateInterviewRoundData {
        CreateInterviewRoundData {
            id: id.to_string(),
            application_id: application_id.to_string(),
            r#type: InterviewRoundType::Phone,
            scheduled_at: None,
            completed_at: None,
            interviewer_name: None,
            notes: None,
            outcome: None,
        }
    }

    fn ids(rounds: &[InterviewRound]) -> Vec<&str> {
        rounds.iter().map(|round| round.id.as_str()).collect()
    }

    #[tokio::test]
    async fn persists_a_round_with_explicit_fields_and_returns_the_entity() {
        let repo = PgInterviewRoundRepository::new(with_applications().await);
        let scheduled_at = at("2024-06-01T10:00:00Z");
        let completed_at = at("2024-06-01T11:00:00Z");

        let created = repo
            .create(CreateInterviewRoundData {
                r#type: InterviewRoundType::Technical,
                scheduled_at: Some(scheduled_at),
                completed_at: Some(completed_at),
                interviewer_name: Some("Jane Doe".to_string()),
                notes: Some("Bring a laptop".to_string()),
                outcome: Some(InterviewRoundOutcome::Passed),
                ..round("r1", "app-1")
            })
            .await
            .unwrap();

        assert_eq!(created.id, "r1");
        assert_eq!(created.application_id, "app-1");
        assert_eq!(created.r#type, InterviewRoundType::Technical);
        assert_eq!(created.scheduled_at, Some(scheduled_at));
        assert_eq!(created.completed_at, Some(completed_at));
        assert_eq!(created.interviewer_name.as_deref(), Some("Jane Doe"));
        assert_eq!(created.notes.as_deref(), Some("Bring a laptop"));
        assert_eq!(created.outcome, InterviewRoundOutcome::Passed);
        assert_eq!(created.push_notification_sent_at, None);
        assert_eq!(created.created_at, created.updated_at);
        assert_eq!(repo.find_by_id("r1").await.unwrap(), Some(created));
    }

    #[tokio::test]
    async fn defaults_outcome_when_not_provided() {
        let repo = PgInterviewRoundRepository::new(with_applications().await);
        let created = repo.create(round("r1", "app-1")).await.unwrap();
        assert_eq!(created.outcome, InterviewRoundOutcome::Pending);
    }

    #[tokio::test]
    async fn find_by_id_returns_none_when_not_found() {
        let repo = PgInterviewRoundRepository::new(with_applications().await);
        assert_eq!(repo.find_by_id("missing").await.unwrap(), None);
    }

    #[tokio::test]
    async fn lists_and_counts_an_applications_rounds_oldest_first() {
        let db = with_applications().await;
        let repo = PgInterviewRoundRepository::new(db.clone());
        repo.create(round("r2", "app-1")).await.unwrap();
        repo.create(round("r1", "app-1")).await.unwrap();
        repo.create(round("r3", "app-2")).await.unwrap();
        set_created_at(&db, "InterviewRound", "r1", at("2024-01-01T00:00:00Z")).await;
        set_created_at(&db, "InterviewRound", "r2", at("2024-01-02T00:00:00Z")).await;

        let rounds = repo.find_all_by_application_id("app-1").await.unwrap();

        assert_eq!(ids(&rounds), vec!["r1", "r2"]);
        assert_eq!(repo.count_by_application_id("app-1").await.unwrap(), 2);
        assert_eq!(repo.count_by_application_id("app-2").await.unwrap(), 1);
    }

    #[tokio::test]
    async fn lists_and_counts_nothing_when_there_are_no_rounds() {
        let repo = PgInterviewRoundRepository::new(with_applications().await);
        assert!(repo.find_all_by_application_id("app-1").await.unwrap().is_empty());
        assert_eq!(repo.count_by_application_id("app-1").await.unwrap(), 0);
        assert!(repo.find_all_by_user_id(USER).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn returns_rounds_across_every_application_owned_by_the_user_oldest_first() {
        let db = with_applications().await;
        seed_user(&db, "u2").await;
        seed_application(&db, "app-foreign", "u2").await;
        let repo = PgInterviewRoundRepository::new(db.clone());
        repo.create(round("r2", "app-2")).await.unwrap();
        repo.create(round("r1", "app-1")).await.unwrap();
        repo.create(round("r-foreign", "app-foreign")).await.unwrap();
        set_created_at(&db, "InterviewRound", "r1", at("2024-01-01T00:00:00Z")).await;
        set_created_at(&db, "InterviewRound", "r2", at("2024-01-02T00:00:00Z")).await;

        let rounds = repo.find_all_by_user_id(USER).await.unwrap();

        assert_eq!(ids(&rounds), vec!["r1", "r2"]);
    }

    /// Unlike offers, the calendar query does not filter on `deletedAt`.
    #[tokio::test]
    async fn the_users_rounds_include_those_of_a_trashed_application() {
        let db = with_applications().await;
        let repo = PgInterviewRoundRepository::new(db.clone());
        repo.create(round("r1", "app-1")).await.unwrap();
        set_timestamp(&db, "app-1", "deletedAt", now()).await;

        assert_eq!(ids(&repo.find_all_by_user_id(USER).await.unwrap()), vec!["r1"]);
    }

    #[tokio::test]
    async fn finds_upcoming_rounds_inside_the_window_soonest_first() {
        let repo = PgInterviewRoundRepository::new(with_applications().await);
        let scheduled = |id: &str, offset: TimeDelta| CreateInterviewRoundData {
            scheduled_at: Some(now() + offset),
            ..round(id, "app-1")
        };
        for data in [
            scheduled("later", TimeDelta::minutes(50)),
            scheduled("sooner", TimeDelta::minutes(10)),
            scheduled("notified", TimeDelta::minutes(20)),
            scheduled("outside", TimeDelta::minutes(90)),
            scheduled("past", TimeDelta::minutes(-5)),
            round("unscheduled", "app-1"),
            CreateInterviewRoundData {
                completed_at: Some(now()),
                ..scheduled("completed", TimeDelta::minutes(30))
            },
            // Only completion and the notification stamp exclude a round;
            // the outcome is not consulted.
            CreateInterviewRoundData {
                outcome: Some(InterviewRoundOutcome::Cancelled),
                ..scheduled("cancelled", TimeDelta::minutes(40))
            },
        ] {
            repo.create(data).await.unwrap();
        }
        repo.update_push_notification_sent_at("notified", now()).await.unwrap();

        let upcoming = repo.find_upcoming_within_window(60 * 60 * 1000).await.unwrap();

        assert_eq!(ids(&upcoming), vec!["sooner", "cancelled", "later"]);
    }

    #[tokio::test]
    async fn updates_only_the_provided_fields_and_moves_updated_at() {
        let repo = PgInterviewRoundRepository::new(with_applications().await);
        let created = repo
            .create(CreateInterviewRoundData {
                interviewer_name: Some("Original Name".to_string()),
                ..round("r1", "app-1")
            })
            .await
            .unwrap();
        sleep_a_tick().await;

        let updated = repo
            .update(
                "r1",
                UpdateInterviewRoundData {
                    outcome: Some(InterviewRoundOutcome::Passed),
                    ..Default::default()
                },
            )
            .await
            .unwrap();

        assert_eq!(updated.outcome, InterviewRoundOutcome::Passed);
        assert_eq!(updated.r#type, InterviewRoundType::Phone);
        assert_eq!(updated.interviewer_name.as_deref(), Some("Original Name"));
        assert!(updated.updated_at > created.updated_at);
    }

    #[tokio::test]
    async fn allows_clearing_a_nullable_field_back_to_null() {
        let repo = PgInterviewRoundRepository::new(with_applications().await);
        repo.create(CreateInterviewRoundData {
            interviewer_name: Some("Jane Doe".to_string()),
            scheduled_at: Some(at("2024-06-01T10:00:00Z")),
            ..round("r1", "app-1")
        })
        .await
        .unwrap();

        let updated = repo
            .update(
                "r1",
                UpdateInterviewRoundData {
                    interviewer_name: Some(None),
                    scheduled_at: Some(None),
                    ..Default::default()
                },
            )
            .await
            .unwrap();

        assert_eq!(updated.interviewer_name, None);
        assert_eq!(updated.scheduled_at, None);
    }

    #[tokio::test]
    async fn writes_every_field() {
        let repo = PgInterviewRoundRepository::new(with_applications().await);
        repo.create(round("r1", "app-1")).await.unwrap();
        let scheduled_at = at("2024-06-01T10:00:00Z");
        let completed_at = at("2024-06-01T11:00:00Z");

        let updated = repo
            .update(
                "r1",
                UpdateInterviewRoundData {
                    r#type: Some(InterviewRoundType::Onsite),
                    scheduled_at: Some(Some(scheduled_at)),
                    completed_at: Some(Some(completed_at)),
                    interviewer_name: Some(Some("Jane Doe".to_string())),
                    notes: Some(Some("Went well".to_string())),
                    outcome: Some(InterviewRoundOutcome::Failed),
                },
            )
            .await
            .unwrap();

        assert_eq!(updated.r#type, InterviewRoundType::Onsite);
        assert_eq!(updated.scheduled_at, Some(scheduled_at));
        assert_eq!(updated.completed_at, Some(completed_at));
        assert_eq!(updated.interviewer_name.as_deref(), Some("Jane Doe"));
        assert_eq!(updated.notes.as_deref(), Some("Went well"));
        assert_eq!(updated.outcome, InterviewRoundOutcome::Failed);
    }

    #[tokio::test]
    async fn updating_an_unknown_round_is_an_internal_error() {
        let repo = PgInterviewRoundRepository::new(with_applications().await);
        let result = repo.update("missing", Default::default()).await;
        assert!(matches!(result, Err(DomainError::Internal(_))));
    }

    #[tokio::test]
    async fn records_when_the_push_notification_went_out() {
        let repo = PgInterviewRoundRepository::new(with_applications().await);
        let created = repo.create(round("r1", "app-1")).await.unwrap();
        sleep_a_tick().await;
        let sent_at = at("2024-06-01T09:00:00Z");

        repo.update_push_notification_sent_at("r1", sent_at).await.unwrap();

        let stored = repo.find_by_id("r1").await.unwrap().unwrap();
        assert_eq!(stored.push_notification_sent_at, Some(sent_at));
        assert!(stored.updated_at > created.updated_at);
    }

    #[tokio::test]
    async fn removes_the_round() {
        let repo = PgInterviewRoundRepository::new(with_applications().await);
        repo.create(round("r1", "app-1")).await.unwrap();

        repo.delete("r1", "app-1").await.unwrap();

        assert_eq!(repo.find_by_id("r1").await.unwrap(), None);
    }

    #[tokio::test]
    async fn a_stored_type_or_outcome_this_build_does_not_know_is_an_error() {
        for column in ["type", "outcome"] {
            let db = with_applications().await;
            let repo = PgInterviewRoundRepository::new(db.clone());
            repo.create(round("r1", "app-1")).await.unwrap();
            sqlx::query(&format!(
                r#"UPDATE "InterviewRound" SET "{column}" = 'teleported' WHERE "id" = 'r1'"#
            ))
            .execute(db.pool())
            .await
            .unwrap();

            let found = repo.find_by_id("r1").await;

            assert!(matches!(found, Err(DomainError::Internal(_))), "{column}");
        }
    }
}

mod offers {
    use super::*;
    use trakwyn_api::domain::offer::OfferPeriod;
    use trakwyn_api::use_cases::ports::{CreateOfferData, OfferRepository, UpdateOfferData};

    fn offer(id: &str, application_id: &str) -> CreateOfferData {
        CreateOfferData {
            id: id.to_string(),
            application_id: application_id.to_string(),
            base_salary: 120_000,
            ..Default::default()
        }
    }

    #[tokio::test]
    async fn creates_an_offer_with_the_default_currency_and_period() {
        let repo = PgOfferRepository::new(with_applications().await);

        let created = repo.create(offer("o1", "app-1")).await.unwrap();

        assert_eq!(created.base_salary, 120_000);
        assert_eq!(created.bonus, None);
        assert_eq!(created.equity, None);
        assert_eq!(created.benefits, None);
        assert_eq!(created.cost_of_living_adjustment, None);
        assert_eq!(created.currency, "USD");
        assert_eq!(created.period, OfferPeriod::Yearly);
        assert_eq!(created.notes, None);
        assert_eq!(created.created_at, created.updated_at);
        // The entity is built in memory, so this is what proves it was stored.
        assert_eq!(repo.find_by_id("o1").await.unwrap(), Some(created));
    }

    #[tokio::test]
    async fn stores_every_field_including_salaries_beyond_32_bits() {
        let repo = PgOfferRepository::new(with_applications().await);

        let created = repo
            .create(CreateOfferData {
                base_salary: 9_000_000_000,
                bonus: Some(3_000_000_000),
                equity: Some("0.5%".to_string()),
                benefits: Some("Health".to_string()),
                cost_of_living_adjustment: Some(-5_000_000_000),
                currency: Some("JPY".to_string()),
                period: Some(OfferPeriod::Monthly),
                notes: Some("Negotiable".to_string()),
                ..offer("o1", "app-1")
            })
            .await
            .unwrap();

        let stored = repo.find_by_id("o1").await.unwrap().unwrap();
        assert_eq!(stored, created);
        assert_eq!(stored.base_salary, 9_000_000_000);
        assert_eq!(stored.bonus, Some(3_000_000_000));
        assert_eq!(stored.cost_of_living_adjustment, Some(-5_000_000_000));
        assert_eq!(stored.equity.as_deref(), Some("0.5%"));
        assert_eq!(stored.benefits.as_deref(), Some("Health"));
        assert_eq!(stored.currency, "JPY");
        assert_eq!(stored.period, OfferPeriod::Monthly);
        assert_eq!(stored.notes.as_deref(), Some("Negotiable"));
    }

    #[tokio::test]
    async fn find_by_id_returns_none_when_not_found() {
        let repo = PgOfferRepository::new(with_applications().await);
        assert_eq!(repo.find_by_id("missing").await.unwrap(), None);
    }

    #[tokio::test]
    async fn lists_and_counts_an_applications_offers() {
        let repo = PgOfferRepository::new(with_applications().await);
        repo.create(offer("o1", "app-1")).await.unwrap();
        repo.create(offer("o2", "app-1")).await.unwrap();
        repo.create(offer("o3", "app-2")).await.unwrap();

        let offers = repo.find_all_by_application_id("app-1").await.unwrap();

        assert_eq!(sorted(offers.into_iter().map(|offer| offer.id).collect()), vec!["o1", "o2"]);
        assert_eq!(repo.count_by_application_id("app-1").await.unwrap(), 2);
        assert_eq!(repo.count_by_application_id("app-2").await.unwrap(), 1);
        assert_eq!(repo.count_by_application_id("missing").await.unwrap(), 0);
    }

    #[tokio::test]
    async fn returns_offers_across_every_application_owned_by_the_user_not_other_users() {
        let db = with_applications().await;
        seed_user(&db, "u2").await;
        seed_application(&db, "app-foreign", "u2").await;
        let repo = PgOfferRepository::new(db);
        repo.create(offer("o1", "app-1")).await.unwrap();
        repo.create(offer("o2", "app-2")).await.unwrap();
        repo.create(offer("o-foreign", "app-foreign")).await.unwrap();

        let offers = repo.find_all_by_user_id(USER).await.unwrap();

        assert_eq!(sorted(offers.into_iter().map(|offer| offer.id).collect()), vec!["o1", "o2"]);
    }

    #[tokio::test]
    async fn returns_nothing_when_the_user_has_no_offers() {
        let repo = PgOfferRepository::new(with_applications().await);
        assert!(repo.find_all_by_user_id(USER).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn excludes_offers_belonging_to_a_trashed_application() {
        let db = with_applications().await;
        set_timestamp(&db, "app-2", "deletedAt", now()).await;
        let repo = PgOfferRepository::new(db);
        repo.create(offer("o1", "app-1")).await.unwrap();
        repo.create(offer("o2", "app-2")).await.unwrap();

        let offers = repo.find_all_by_user_id(USER).await.unwrap();

        assert_eq!(offers.into_iter().map(|offer| offer.id).collect::<Vec<_>>(), vec!["o1"]);
    }

    #[tokio::test]
    async fn updates_only_the_provided_fields_and_moves_updated_at() {
        let repo = PgOfferRepository::new(with_applications().await);
        let created = repo
            .create(CreateOfferData {
                bonus: Some(10_000),
                equity: Some("0.5%".to_string()),
                ..offer("o1", "app-1")
            })
            .await
            .unwrap();
        sleep_a_tick().await;

        let updated = repo
            .update(
                "o1",
                UpdateOfferData {
                    base_salary: Some(130_000),
                    bonus: Some(None),
                    ..Default::default()
                },
            )
            .await
            .unwrap();

        assert_eq!(updated.base_salary, 130_000);
        assert_eq!(updated.bonus, None);
        assert_eq!(updated.equity.as_deref(), Some("0.5%"));
        assert_eq!(updated.currency, "USD");
        assert_eq!(updated.created_at, created.created_at);
        assert!(updated.updated_at > created.updated_at);
        assert_eq!(repo.find_by_id("o1").await.unwrap(), Some(updated));
    }

    #[tokio::test]
    async fn writes_every_field() {
        let repo = PgOfferRepository::new(with_applications().await);
        repo.create(offer("o1", "app-1")).await.unwrap();

        let updated = repo
            .update(
                "o1",
                UpdateOfferData {
                    base_salary: Some(60),
                    bonus: Some(Some(5)),
                    equity: Some(Some("1%".to_string())),
                    benefits: Some(Some("Gym".to_string())),
                    cost_of_living_adjustment: Some(Some(-2)),
                    currency: Some("EUR".to_string()),
                    period: Some(OfferPeriod::Hourly),
                    notes: Some(Some("Contract".to_string())),
                },
            )
            .await
            .unwrap();

        assert_eq!(updated.base_salary, 60);
        assert_eq!(updated.bonus, Some(5));
        assert_eq!(updated.equity.as_deref(), Some("1%"));
        assert_eq!(updated.benefits.as_deref(), Some("Gym"));
        assert_eq!(updated.cost_of_living_adjustment, Some(-2));
        assert_eq!(updated.currency, "EUR");
        assert_eq!(updated.period, OfferPeriod::Hourly);
        assert_eq!(updated.notes.as_deref(), Some("Contract"));
    }

    #[tokio::test]
    async fn updating_an_unknown_offer_is_an_internal_error() {
        let repo = PgOfferRepository::new(with_applications().await);
        let result = repo.update("missing", Default::default()).await;
        assert!(matches!(result, Err(DomainError::Internal(_))));
    }

    #[tokio::test]
    async fn removes_the_offer() {
        let repo = PgOfferRepository::new(with_applications().await);
        repo.create(offer("o1", "app-1")).await.unwrap();

        repo.delete("o1").await.unwrap();

        assert_eq!(repo.find_by_id("o1").await.unwrap(), None);
    }

    #[tokio::test]
    async fn a_stored_period_this_build_does_not_know_is_an_error() {
        let db = with_applications().await;
        let repo = PgOfferRepository::new(db.clone());
        repo.create(offer("o1", "app-1")).await.unwrap();
        sqlx::query(r#"UPDATE "Offer" SET "period" = 'fortnightly' WHERE "id" = 'o1'"#)
            .execute(db.pool())
            .await
            .unwrap();

        assert!(matches!(repo.find_by_id("o1").await, Err(DomainError::Internal(_))));
    }
}
