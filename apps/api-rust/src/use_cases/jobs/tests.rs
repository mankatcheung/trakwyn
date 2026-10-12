use std::sync::Arc;

use chrono::{DateTime, Utc};

use super::*;
use crate::domain::application::{Application, ApplicationStatus};
use crate::domain::contact::Contact;
use crate::domain::note::Note;
use crate::use_cases::clock::now;
use crate::use_cases::errors::ErrorCode;
use crate::use_cases::test_support::{
    application_owned_by, sequential_ids, FakeApplicationRepository, FakeContactRepository,
    FakeDocumentDraftRepository, FakeDocumentRepository, FakeInterviewRoundRepository,
    FakeNoteRepository, FakeOfferRepository,
};

const OWNER: &str = "user-owner";
const STRANGER: &str = "user-stranger";

fn at(seconds: i64) -> DateTime<Utc> {
    DateTime::<Utc>::from_timestamp(seconds, 0).unwrap()
}

fn created_at(id: &str, seconds: i64) -> Application {
    Application { created_at: at(seconds), ..application_owned_by(id, OWNER) }
}

fn trashed(id: &str, user_id: &str) -> Application {
    Application { deleted_at: Some(at(500)), ..application_owned_by(id, user_id) }
}

fn repository(applications: Vec<Application>) -> Arc<FakeApplicationRepository> {
    Arc::new(FakeApplicationRepository::with(applications))
}

mod create {
    use super::*;

    fn use_case(applications: &Arc<FakeApplicationRepository>) -> CreateApplicationUseCase {
        CreateApplicationUseCase {
            application_repository: applications.clone(),
            generate_id: sequential_ids("id"),
        }
    }

    fn minimal() -> CreateApplicationInput {
        CreateApplicationInput {
            user_id: OWNER.to_string(),
            company: "Globex".to_string(),
            role: "Designer".to_string(),
            ..CreateApplicationInput::default()
        }
    }

    #[tokio::test]
    async fn stores_every_provided_field() {
        let applications = repository(vec![]);
        let input = CreateApplicationInput {
            status: Some(ApplicationStatus::Applied),
            job_url: Some("https://globex.example/jobs/1".to_string()),
            location: Some("Remote".to_string()),
            salary_range: Some("100k".to_string()),
            description: Some("Design things".to_string()),
            starred: Some(true),
            source: Some("LinkedIn".to_string()),
            follow_up_at: Some(at(1_000)),
            tags: Some(vec!["remote".to_string(), "design".to_string()]),
            ..minimal()
        };

        let created = use_case(&applications).execute(input).await.unwrap();

        assert_eq!(created.user_id, OWNER);
        assert_eq!(created.company, "Globex");
        assert_eq!(created.role, "Designer");
        assert_eq!(created.status, ApplicationStatus::Applied);
        assert_eq!(created.job_url.as_deref(), Some("https://globex.example/jobs/1"));
        assert_eq!(created.location.as_deref(), Some("Remote"));
        assert_eq!(created.salary_range.as_deref(), Some("100k"));
        assert_eq!(created.description.as_deref(), Some("Design things"));
        assert!(created.starred);
        assert_eq!(created.source.as_deref(), Some("LinkedIn"));
        assert_eq!(created.follow_up_at, Some(at(1_000)));
        assert_eq!(created.tags, vec!["remote", "design"]);
        assert_eq!(applications.all(), vec![created]);
    }

    #[tokio::test]
    async fn defaults_the_status_to_draft_and_the_rest_to_empty() {
        let applications = repository(vec![]);

        let created = use_case(&applications).execute(minimal()).await.unwrap();

        assert_eq!(created.status, ApplicationStatus::Draft);
        assert_eq!(created.job_url, None);
        assert_eq!(created.location, None);
        assert_eq!(created.salary_range, None);
        assert_eq!(created.description, None);
        assert_eq!(created.source, None);
        assert_eq!(created.follow_up_at, None);
        assert_eq!(created.applied_at, None);
        assert!(!created.starred);
        assert!(created.tags.is_empty());
    }

    #[tokio::test]
    async fn mints_the_tag_ids_before_the_application_id() {
        let applications = repository(vec![]);
        let input = CreateApplicationInput {
            tags: Some(vec!["a".to_string(), "b".to_string()]),
            ..minimal()
        };

        let created = use_case(&applications).execute(input).await.unwrap();

        assert_eq!(created.id, "id-3");
    }

    #[tokio::test]
    async fn fails_once_the_users_quota_is_used_up() {
        let applications = repository(vec![]);
        applications.set_application_count(OWNER, 50);

        let err = use_case(&applications).execute(minimal()).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::QuotaExceeded);
        assert_eq!(err.to_string(), "You have reached the maximum of 50 applications");
        assert!(applications.all().is_empty());
    }
}

mod get {
    use super::*;

    fn input(user_id: &str, application_id: &str, include_trashed: bool) -> GetApplicationInput {
        GetApplicationInput {
            user_id: user_id.to_string(),
            application_id: application_id.to_string(),
            include_trashed,
        }
    }

    fn use_case() -> GetApplicationUseCase {
        GetApplicationUseCase {
            application_repository: repository(vec![
                application_owned_by("live", OWNER),
                trashed("gone", OWNER),
            ]),
        }
    }

    #[tokio::test]
    async fn returns_the_owners_application() {
        let found = use_case().execute(input(OWNER, "live", false)).await.unwrap();
        assert_eq!(found.id, "live");
    }

    #[tokio::test]
    async fn fails_when_the_application_does_not_exist() {
        let err = use_case().execute(input(OWNER, "missing", false)).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Application not found");
    }

    #[tokio::test]
    async fn refuses_someone_elses_application() {
        let err = use_case().execute(input(STRANGER, "live", false)).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::Forbidden);
        assert_eq!(err.to_string(), "Forbidden");
    }

    #[tokio::test]
    async fn a_trashed_application_is_not_found_by_default() {
        let err = use_case().execute(input(OWNER, "gone", false)).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::NotFound);
    }

    #[tokio::test]
    async fn a_trashed_application_is_returned_when_asked_for() {
        let found = use_case().execute(input(OWNER, "gone", true)).await.unwrap();
        assert_eq!(found.deleted_at, Some(at(500)));
    }

    #[tokio::test]
    async fn ownership_still_applies_when_including_trashed() {
        let err = use_case().execute(input(STRANGER, "gone", true)).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::Forbidden);
    }
}

mod list {
    use super::*;

    fn seeded() -> Arc<FakeApplicationRepository> {
        repository(vec![
            created_at("old", 100),
            Application { status: ApplicationStatus::Offered, ..created_at("new", 200) },
            application_owned_by("theirs", STRANGER),
            trashed("gone", OWNER),
        ])
    }

    fn ids(applications: &[Application]) -> Vec<&str> {
        applications.iter().map(|application| application.id.as_str()).collect()
    }

    #[tokio::test]
    async fn returns_the_users_live_applications_newest_first() {
        let use_case = GetApplicationsUseCase { application_repository: seeded() };

        let found = use_case
            .execute(GetApplicationsInput { user_id: OWNER.to_string(), status: None })
            .await
            .unwrap();

        assert_eq!(ids(&found), vec!["new", "old"]);
    }

    #[tokio::test]
    async fn filters_by_status() {
        let use_case = GetApplicationsUseCase { application_repository: seeded() };

        let found = use_case
            .execute(GetApplicationsInput {
                user_id: OWNER.to_string(),
                status: Some(ApplicationStatus::Offered),
            })
            .await
            .unwrap();

        assert_eq!(ids(&found), vec!["new"]);
    }

    #[tokio::test]
    async fn a_user_with_no_applications_gets_an_empty_list() {
        let use_case = GetApplicationsUseCase { application_repository: seeded() };

        let found = use_case
            .execute(GetApplicationsInput { user_id: "nobody".to_string(), status: None })
            .await
            .unwrap();

        assert!(found.is_empty());
    }

    #[tokio::test]
    async fn lists_the_trash_most_recently_deleted_first() {
        let applications = repository(vec![
            Application { deleted_at: Some(at(100)), ..application_owned_by("first", OWNER) },
            Application { deleted_at: Some(at(200)), ..application_owned_by("second", OWNER) },
            application_owned_by("live", OWNER),
            trashed("theirs", STRANGER),
        ]);
        let use_case = ListTrashedApplicationsUseCase { application_repository: applications };

        let found = use_case.execute(OWNER).await.unwrap();

        assert_eq!(ids(&found), vec!["second", "first"]);
    }
}

mod page {
    use super::*;

    fn many(count: i64) -> Arc<FakeApplicationRepository> {
        repository((1..=count).map(|n| created_at(&format!("app-{n:03}"), n)).collect())
    }

    fn input(limit: Option<i64>) -> GetApplicationsPageInput {
        GetApplicationsPageInput {
            user_id: OWNER.to_string(),
            limit,
            ..GetApplicationsPageInput::default()
        }
    }

    #[tokio::test]
    async fn defaults_the_limit_to_twenty() {
        let use_case = GetApplicationsPageUseCase { application_repository: many(25) };

        let page = use_case.execute(input(None)).await.unwrap();

        assert_eq!(page.items.len(), 20);
        assert!(page.has_next_page);
        assert_eq!(page.next_cursor.as_deref(), Some("app-006"));
    }

    #[tokio::test]
    async fn clamps_a_limit_above_the_maximum() {
        let use_case = GetApplicationsPageUseCase { application_repository: many(120) };

        let page = use_case.execute(input(Some(1_000))).await.unwrap();

        assert_eq!(page.items.len(), 100);
    }

    #[tokio::test]
    async fn clamps_a_limit_below_one_up_to_one() {
        let use_case = GetApplicationsPageUseCase { application_repository: many(3) };

        for limit in [0, -5] {
            let page = use_case.execute(input(Some(limit))).await.unwrap();
            assert_eq!(page.items.len(), 1);
        }
    }

    #[tokio::test]
    async fn the_cursor_continues_where_the_last_page_stopped() {
        let use_case = GetApplicationsPageUseCase { application_repository: many(5) };

        let first = use_case.execute(input(Some(2))).await.unwrap();
        let second = use_case
            .execute(GetApplicationsPageInput {
                cursor: first.next_cursor.clone(),
                ..input(Some(2))
            })
            .await
            .unwrap();

        assert_eq!(first.next_cursor.as_deref(), Some("app-004"));
        let ids: Vec<&str> = second.items.iter().map(|a| a.id.as_str()).collect();
        assert_eq!(ids, vec!["app-003", "app-002"]);
    }

    #[tokio::test]
    async fn the_last_page_has_no_cursor() {
        let use_case = GetApplicationsPageUseCase { application_repository: many(2) };

        let page = use_case.execute(input(Some(2))).await.unwrap();

        assert!(!page.has_next_page);
        assert_eq!(page.next_cursor, None);
    }

    #[tokio::test]
    async fn passes_the_filters_through() {
        let applications = repository(vec![
            Application { starred: true, company: "Globex".to_string(), ..created_at("match", 3) },
            Application { starred: true, ..created_at("other-company", 2) },
            Application { company: "Globex".to_string(), ..created_at("not-starred", 1) },
        ]);
        let use_case = GetApplicationsPageUseCase { application_repository: applications };

        let page = use_case
            .execute(GetApplicationsPageInput {
                starred: Some(true),
                search: Some("globex".to_string()),
                status: Some(ApplicationStatus::Applied),
                ..input(None)
            })
            .await
            .unwrap();

        let ids: Vec<&str> = page.items.iter().map(|a| a.id.as_str()).collect();
        assert_eq!(ids, vec!["match"]);
    }
}

mod trash {
    use super::*;

    #[tokio::test]
    async fn delete_moves_the_application_to_trash() {
        let applications = repository(vec![application_owned_by("app-1", OWNER)]);
        let use_case = DeleteApplicationUseCase { application_repository: applications.clone() };
        let before = now();

        use_case
            .execute(DeleteApplicationInput {
                user_id: OWNER.to_string(),
                application_id: "app-1".to_string(),
            })
            .await
            .unwrap();

        let stored = applications.all();
        assert_eq!(stored.len(), 1, "nothing is destroyed");
        assert!(stored[0].deleted_at.is_some_and(|deleted_at| deleted_at >= before));
    }

    #[tokio::test]
    async fn delete_fails_for_a_missing_or_already_trashed_application() {
        let applications = repository(vec![trashed("gone", OWNER)]);
        let use_case = DeleteApplicationUseCase { application_repository: applications };

        for id in ["missing", "gone"] {
            let err = use_case
                .execute(DeleteApplicationInput {
                    user_id: OWNER.to_string(),
                    application_id: id.to_string(),
                })
                .await
                .unwrap_err();
            assert_eq!(err.code(), ErrorCode::NotFound);
            assert_eq!(err.to_string(), "Application not found");
        }
    }

    #[tokio::test]
    async fn delete_refuses_someone_elses_application() {
        let applications = repository(vec![application_owned_by("app-1", OWNER)]);
        let use_case = DeleteApplicationUseCase { application_repository: applications.clone() };

        let err = use_case
            .execute(DeleteApplicationInput {
                user_id: STRANGER.to_string(),
                application_id: "app-1".to_string(),
            })
            .await
            .unwrap_err();

        assert_eq!(err.code(), ErrorCode::Forbidden);
        assert_eq!(applications.all()[0].deleted_at, None);
    }

    fn restore_input(user_id: &str, application_id: &str) -> RestoreApplicationInput {
        RestoreApplicationInput {
            user_id: user_id.to_string(),
            application_id: application_id.to_string(),
        }
    }

    #[tokio::test]
    async fn restore_brings_an_application_back() {
        let applications = repository(vec![trashed("gone", OWNER)]);
        let use_case = RestoreApplicationUseCase { application_repository: applications.clone() };

        use_case.execute(restore_input(OWNER, "gone")).await.unwrap();

        assert_eq!(applications.all()[0].deleted_at, None);
    }

    #[tokio::test]
    async fn restore_refuses_one_that_is_not_in_trash() {
        let applications = repository(vec![application_owned_by("live", OWNER)]);
        let use_case = RestoreApplicationUseCase { application_repository: applications };

        for id in ["live", "missing"] {
            let err = use_case.execute(restore_input(OWNER, id)).await.unwrap_err();
            assert_eq!(err.code(), ErrorCode::NotFound);
            // As `apps/api` words it: its NotFoundError appends "not found"
            // to anything that does not already end with it.
            assert_eq!(err.to_string(), "Application not found in Trash not found");
        }
    }

    #[tokio::test]
    async fn restore_refuses_someone_elses() {
        let applications = repository(vec![trashed("gone", OWNER)]);
        let use_case = RestoreApplicationUseCase { application_repository: applications.clone() };

        let err = use_case.execute(restore_input(STRANGER, "gone")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Forbidden);
        assert!(applications.all()[0].deleted_at.is_some());
    }
}

mod section_counts {
    use super::*;

    fn note(id: &str, application_id: &str) -> Note {
        Note {
            id: id.to_string(),
            application_id: application_id.to_string(),
            content: "text".to_string(),
            created_at: at(0),
            updated_at: at(0),
        }
    }

    fn contact(id: &str, application_id: &str) -> Contact {
        Contact {
            id: id.to_string(),
            application_id: application_id.to_string(),
            name: "Sam".to_string(),
            role: None,
            email: None,
            phone: None,
            linkedin_url: None,
            notes: None,
            created_at: at(0),
            updated_at: at(0),
        }
    }

    fn use_case(notes: Vec<Note>, contacts: Vec<Contact>) -> GetApplicationSectionCountsUseCase {
        GetApplicationSectionCountsUseCase {
            application_repository: repository(vec![
                application_owned_by("app-1", OWNER),
                trashed("gone", OWNER),
            ]),
            note_repository: Arc::new(FakeNoteRepository::with(notes)),
            interview_round_repository: Arc::new(FakeInterviewRoundRepository::default()),
            contact_repository: Arc::new(FakeContactRepository::with(contacts)),
            offer_repository: Arc::new(FakeOfferRepository::default()),
            document_repository: Arc::new(FakeDocumentRepository::default()),
            document_draft_repository: Arc::new(FakeDocumentDraftRepository::default()),
        }
    }

    fn input(user_id: &str, application_id: &str) -> GetApplicationSectionCountsInput {
        GetApplicationSectionCountsInput {
            user_id: user_id.to_string(),
            application_id: application_id.to_string(),
        }
    }

    #[tokio::test]
    async fn counts_each_section_of_this_application_only() {
        let use_case = use_case(
            vec![note("n1", "app-1"), note("n2", "app-1"), note("n3", "other")],
            vec![contact("c1", "app-1")],
        );

        let counts = use_case.execute(input(OWNER, "app-1")).await.unwrap();

        assert_eq!(
            counts,
            ApplicationSectionCounts {
                notes: 2,
                interviews: 0,
                contacts: 1,
                documents: 0,
                document_drafts: 0,
                offers: 0,
            }
        );
    }

    #[tokio::test]
    async fn a_missing_or_trashed_application_is_not_found() {
        let use_case = use_case(vec![], vec![]);

        for id in ["missing", "gone"] {
            let err = use_case.execute(input(OWNER, id)).await.unwrap_err();
            assert_eq!(err.code(), ErrorCode::NotFound);
        }
    }

    #[tokio::test]
    async fn refuses_someone_elses_application() {
        let err = use_case(vec![], vec![]).execute(input(STRANGER, "app-1")).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::Forbidden);
    }
}
