use std::sync::Arc;

use chrono::{DateTime, Utc};

use super::*;
use crate::domain::application::{Application, ApplicationStatus};
use crate::use_cases::errors::ErrorCode;
use crate::use_cases::test_support::{
    application_owned_by, sequential_ids, FakeActivityLogRepository, FakeApplicationRepository,
    FakeTransactionManager,
};

const OWNER: &str = "user-owner";
const STRANGER: &str = "user-stranger";

struct Fixture {
    applications: Arc<FakeApplicationRepository>,
    activity: Arc<FakeActivityLogRepository>,
    transactions: Arc<FakeTransactionManager>,
}

impl Fixture {
    fn new(applications: Vec<Application>) -> Self {
        Self {
            applications: Arc::new(FakeApplicationRepository::with(applications)),
            activity: Arc::default(),
            transactions: Arc::default(),
        }
    }

    fn update(&self) -> UpdateApplicationUseCase {
        UpdateApplicationUseCase {
            application_repository: self.applications.clone(),
            activity_log_repository: self.activity.clone(),
            generate_id: sequential_ids("id"),
            transaction_manager: self.transactions.clone(),
        }
    }

    fn bulk_update(&self) -> BulkUpdateApplicationsUseCase {
        BulkUpdateApplicationsUseCase {
            update_application_use_case: self.update(),
            transaction_manager: self.transactions.clone(),
        }
    }

    fn bulk_add_tag(&self) -> BulkAddTagToApplicationsUseCase {
        BulkAddTagToApplicationsUseCase {
            application_repository: self.applications.clone(),
            update_application_use_case: self.update(),
            transaction_manager: self.transactions.clone(),
        }
    }

    fn bulk_delete(&self) -> BulkDeleteApplicationsUseCase {
        BulkDeleteApplicationsUseCase {
            delete_application_use_case: DeleteApplicationUseCase {
                application_repository: self.applications.clone(),
            },
        }
    }

    fn bulk_restore(&self) -> BulkRestoreApplicationsUseCase {
        BulkRestoreApplicationsUseCase {
            restore_application_use_case: RestoreApplicationUseCase {
                application_repository: self.applications.clone(),
            },
        }
    }

    fn stored(&self, id: &str) -> Application {
        self.applications.all().into_iter().find(|application| application.id == id).unwrap()
    }
}

fn ids(ids: &[&str]) -> Vec<String> {
    ids.iter().map(|id| id.to_string()).collect()
}

fn too_many() -> Vec<String> {
    (0..201).map(|n| format!("app-{n}")).collect()
}

fn trashed(id: &str, user_id: &str) -> Application {
    Application {
        deleted_at: Some(DateTime::<Utc>::from_timestamp(500, 0).unwrap()),
        ..application_owned_by(id, user_id)
    }
}

fn assert_batch_size_errors(
    empty: crate::use_cases::errors::DomainError,
    oversized: crate::use_cases::errors::DomainError,
) {
    assert_eq!(empty.code(), ErrorCode::Validation);
    assert_eq!(empty.to_string(), "At least one application id is required");
    assert_eq!(oversized.code(), ErrorCode::Validation);
    assert_eq!(oversized.to_string(), "Cannot act on more than 200 applications at once");
}

mod update {
    use super::*;

    fn input(application_ids: Vec<String>) -> BulkUpdateApplicationsInput {
        BulkUpdateApplicationsInput {
            user_id: OWNER.to_string(),
            application_ids,
            status: Some(ApplicationStatus::Rejected),
            starred: Some(true),
        }
    }

    #[tokio::test]
    async fn rejects_an_empty_or_oversized_batch() {
        let fixture = Fixture::new(vec![]);
        let empty = fixture.bulk_update().execute(input(vec![])).await.unwrap_err();
        let oversized = fixture.bulk_update().execute(input(too_many())).await.unwrap_err();
        assert_batch_size_errors(empty, oversized);
    }

    #[tokio::test]
    async fn accepts_a_batch_at_the_cap() {
        let at_cap: Vec<String> = (0..200).map(|n| format!("app-{n}")).collect();
        let fixture =
            Fixture::new(at_cap.iter().map(|id| application_owned_by(id, OWNER)).collect());

        let updated = fixture.bulk_update().execute(input(at_cap)).await.unwrap();

        assert_eq!(updated.len(), 200);
    }

    #[tokio::test]
    async fn applies_the_same_change_to_every_id_in_order() {
        let fixture = Fixture::new(vec![
            application_owned_by("a", OWNER),
            application_owned_by("b", OWNER),
            application_owned_by("untouched", OWNER),
        ]);

        let updated = fixture.bulk_update().execute(input(ids(&["b", "a"]))).await.unwrap();

        let returned: Vec<&str> = updated.iter().map(|a| a.id.as_str()).collect();
        assert_eq!(returned, vec!["b", "a"]);
        for application in &updated {
            assert_eq!(application.status, ApplicationStatus::Rejected);
            assert!(application.starred);
        }
        assert_eq!(fixture.stored("untouched").status, ApplicationStatus::Applied);
        assert_eq!(fixture.activity.entries().len(), 2);
    }

    #[tokio::test]
    async fn one_refused_id_fails_the_whole_batch() {
        let fixture = Fixture::new(vec![
            application_owned_by("mine", OWNER),
            application_owned_by("theirs", STRANGER),
        ]);

        let err = fixture.bulk_update().execute(input(ids(&["mine", "theirs"]))).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Forbidden);
        assert_eq!(fixture.stored("theirs").status, ApplicationStatus::Applied);
    }

    #[tokio::test]
    async fn wraps_the_batch_in_a_transaction_of_its_own() {
        let fixture = Fixture::new(vec![application_owned_by("a", OWNER)]);

        fixture.bulk_update().execute(input(ids(&["a"]))).await.unwrap();

        // The batch's, and the one the single update joins it with.
        assert_eq!(fixture.transactions.runs(), 2);
    }
}

mod add_tag {
    use super::*;

    fn input(application_ids: Vec<String>) -> BulkAddTagToApplicationsInput {
        BulkAddTagToApplicationsInput {
            user_id: OWNER.to_string(),
            application_ids,
            tag: "urgent".to_string(),
        }
    }

    #[tokio::test]
    async fn rejects_an_empty_or_oversized_batch() {
        let fixture = Fixture::new(vec![]);
        let empty = fixture.bulk_add_tag().execute(input(vec![])).await.unwrap_err();
        let oversized = fixture.bulk_add_tag().execute(input(too_many())).await.unwrap_err();
        assert_batch_size_errors(empty, oversized);
    }

    #[tokio::test]
    async fn fails_when_an_application_does_not_exist() {
        let fixture = Fixture::new(vec![application_owned_by("a", OWNER)]);

        let err = fixture.bulk_add_tag().execute(input(ids(&["a", "missing"]))).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Application not found");
    }

    #[tokio::test]
    async fn refuses_someone_elses_application() {
        let fixture = Fixture::new(vec![application_owned_by("theirs", STRANGER)]);

        let err = fixture.bulk_add_tag().execute(input(ids(&["theirs"]))).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Forbidden);
        assert!(fixture.stored("theirs").tags.is_empty());
    }

    #[tokio::test]
    async fn merges_the_tag_without_duplicating_it() {
        let fixture = Fixture::new(vec![
            Application { tags: vec!["remote".to_string()], ..application_owned_by("a", OWNER) },
            Application {
                tags: vec!["urgent".to_string(), "remote".to_string()],
                ..application_owned_by("b", OWNER)
            },
        ]);

        let updated = fixture.bulk_add_tag().execute(input(ids(&["a", "b"]))).await.unwrap();

        assert_eq!(updated[0].tags, vec!["remote", "urgent"]);
        assert_eq!(updated[1].tags, vec!["urgent", "remote"]);
        assert!(fixture.activity.entries().is_empty(), "tags are not an activity entry");
    }
}

mod delete {
    use super::*;

    fn input(application_ids: Vec<String>) -> BulkDeleteApplicationsInput {
        BulkDeleteApplicationsInput { user_id: OWNER.to_string(), application_ids }
    }

    #[tokio::test]
    async fn rejects_an_empty_or_oversized_batch() {
        let fixture = Fixture::new(vec![]);
        let empty = fixture.bulk_delete().execute(input(vec![])).await.unwrap_err();
        let oversized = fixture.bulk_delete().execute(input(too_many())).await.unwrap_err();
        assert_batch_size_errors(empty, oversized);
    }

    #[tokio::test]
    async fn trashes_every_id() {
        let fixture =
            Fixture::new(vec![application_owned_by("a", OWNER), application_owned_by("b", OWNER)]);

        fixture.bulk_delete().execute(input(ids(&["a", "b"]))).await.unwrap();

        assert!(fixture.stored("a").deleted_at.is_some());
        assert!(fixture.stored("b").deleted_at.is_some());
    }

    #[tokio::test]
    async fn an_id_that_is_already_gone_is_a_no_op() {
        let fixture = Fixture::new(vec![application_owned_by("a", OWNER), trashed("gone", OWNER)]);

        fixture.bulk_delete().execute(input(ids(&["missing", "gone", "a"]))).await.unwrap();

        assert!(fixture.stored("a").deleted_at.is_some());
    }

    #[tokio::test]
    async fn a_real_failure_is_reported_after_every_id_was_attempted() {
        let fixture = Fixture::new(vec![
            application_owned_by("theirs", STRANGER),
            application_owned_by("mine", OWNER),
        ]);

        let err = fixture.bulk_delete().execute(input(ids(&["theirs", "mine"]))).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Forbidden);
        assert_eq!(fixture.stored("theirs").deleted_at, None);
        assert!(fixture.stored("mine").deleted_at.is_some(), "the batch is not a transaction");
    }
}

mod restore {
    use super::*;

    fn input(application_ids: Vec<String>) -> BulkRestoreApplicationsInput {
        BulkRestoreApplicationsInput { user_id: OWNER.to_string(), application_ids }
    }

    #[tokio::test]
    async fn rejects_an_empty_or_oversized_batch() {
        let fixture = Fixture::new(vec![]);
        let empty = fixture.bulk_restore().execute(input(vec![])).await.unwrap_err();
        let oversized = fixture.bulk_restore().execute(input(too_many())).await.unwrap_err();
        assert_batch_size_errors(empty, oversized);
    }

    #[tokio::test]
    async fn restores_every_id_and_reports_how_many_came_back() {
        let fixture = Fixture::new(vec![trashed("a", OWNER), trashed("b", OWNER)]);

        let result = fixture.bulk_restore().execute(input(ids(&["a", "b"]))).await.unwrap();

        assert_eq!(result.restored, 2);
        assert_eq!(fixture.stored("a").deleted_at, None);
        assert_eq!(fixture.stored("b").deleted_at, None);
    }

    #[tokio::test]
    async fn an_id_that_is_not_in_trash_is_a_no_op_and_not_counted() {
        let fixture = Fixture::new(vec![trashed("a", OWNER), application_owned_by("live", OWNER)]);

        let result =
            fixture.bulk_restore().execute(input(ids(&["live", "missing", "a"]))).await.unwrap();

        assert_eq!(result.restored, 1);
    }

    #[tokio::test]
    async fn someone_elses_id_is_never_silently_skipped() {
        let fixture = Fixture::new(vec![trashed("mine", OWNER), trashed("theirs", STRANGER)]);

        let err =
            fixture.bulk_restore().execute(input(ids(&["mine", "theirs"]))).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Forbidden);
        assert!(fixture.stored("theirs").deleted_at.is_some());
    }
}
