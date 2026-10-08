use std::sync::Arc;

use chrono::{DateTime, Utc};

use super::*;
use crate::domain::activity_log::ActivityEventType;
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
    /// An applied column of `a`, `b`, `c` (in that order), a draft `d`, a
    /// stranger's applied card and a trashed one.
    fn new() -> Self {
        let card = |id: &str, position: i32| Application {
            board_position: position,
            ..application_owned_by(id, OWNER)
        };
        let applications = vec![
            card("a", 0),
            card("b", 1),
            card("c", 2),
            Application { status: ApplicationStatus::Draft, ..card("d", 0) },
            application_owned_by("theirs", STRANGER),
            Application {
                deleted_at: Some(DateTime::<Utc>::from_timestamp(500, 0).unwrap()),
                ..card("gone", 3)
            },
        ];
        Self {
            applications: Arc::new(FakeApplicationRepository::with(applications)),
            activity: Arc::default(),
            transactions: Arc::default(),
        }
    }

    fn use_case(&self) -> MoveApplicationOnBoardUseCase {
        MoveApplicationOnBoardUseCase {
            application_repository: self.applications.clone(),
            update_application_use_case: UpdateApplicationUseCase {
                application_repository: self.applications.clone(),
                activity_log_repository: self.activity.clone(),
                generate_id: sequential_ids("id"),
                transaction_manager: self.transactions.clone(),
            },
            transaction_manager: self.transactions.clone(),
        }
    }

    fn stored(&self, id: &str) -> Application {
        self.applications.all().into_iter().find(|application| application.id == id).unwrap()
    }
}

fn input(
    application_id: &str,
    to_status: ApplicationStatus,
    ordered: &[&str],
) -> MoveApplicationOnBoardInput {
    MoveApplicationOnBoardInput {
        user_id: OWNER.to_string(),
        application_id: application_id.to_string(),
        to_status,
        ordered_ids: ordered.iter().map(|id| id.to_string()).collect(),
    }
}

fn ids(applications: &[Application]) -> Vec<&str> {
    applications.iter().map(|application| application.id.as_str()).collect()
}

#[tokio::test]
async fn a_move_within_a_column_renumbers_it_and_logs_nothing() {
    let fixture = Fixture::new();

    let column = fixture
        .use_case()
        .execute(input("c", ApplicationStatus::Applied, &["c", "a", "b"]))
        .await
        .unwrap();

    assert_eq!(ids(&column), vec!["c", "a", "b"]);
    assert_eq!(fixture.stored("c").board_position, 0);
    assert_eq!(fixture.stored("a").board_position, 1);
    assert_eq!(fixture.stored("b").board_position, 2);
    assert!(fixture.activity.entries().is_empty());
    assert_eq!(fixture.transactions.runs(), 1);
}

#[tokio::test]
async fn a_move_across_columns_changes_the_status_then_renumbers() {
    let fixture = Fixture::new();

    let column = fixture
        .use_case()
        .execute(input("d", ApplicationStatus::Applied, &["a", "d", "b", "c"]))
        .await
        .unwrap();

    assert_eq!(ids(&column), vec!["a", "d", "b", "c"]);
    let moved = fixture.stored("d");
    assert_eq!(moved.status, ApplicationStatus::Applied);
    assert_eq!(moved.board_position, 1);
    assert!(moved.applied_at.is_some(), "the update use case stamps appliedAt");

    let entries = fixture.activity.entries();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].event_type, ActivityEventType::StatusChanged);
    assert_eq!(entries[0].payload, r#"{"from":"draft","to":"applied"}"#);
    // The move's transaction, and the one the status change joins it with.
    assert_eq!(fixture.transactions.runs(), 2);
}

#[tokio::test]
async fn rejects_an_empty_list() {
    let err = Fixture::new()
        .use_case()
        .execute(input("a", ApplicationStatus::Applied, &[]))
        .await
        .unwrap_err();
    assert_eq!(err.code(), ErrorCode::Validation);
    assert_eq!(err.to_string(), "At least one application id is required");
}

#[tokio::test]
async fn rejects_more_ids_than_the_board_cap() {
    let many: Vec<String> = (0..501).map(|n| format!("app-{n}")).collect();
    let many: Vec<&str> = many.iter().map(String::as_str).collect();

    let err = Fixture::new()
        .use_case()
        .execute(input("app-0", ApplicationStatus::Applied, &many))
        .await
        .unwrap_err();

    assert_eq!(err.code(), ErrorCode::Validation);
    assert_eq!(err.to_string(), "Cannot reorder more than 500 applications at once");
}

#[tokio::test]
async fn rejects_duplicate_ids() {
    let err = Fixture::new()
        .use_case()
        .execute(input("a", ApplicationStatus::Applied, &["a", "b", "a"]))
        .await
        .unwrap_err();
    assert_eq!(err.code(), ErrorCode::Validation);
    assert_eq!(err.to_string(), "Duplicate application ids");
}

#[tokio::test]
async fn rejects_a_list_without_the_moved_application() {
    let err = Fixture::new()
        .use_case()
        .execute(input("a", ApplicationStatus::Applied, &["b", "c"]))
        .await
        .unwrap_err();
    assert_eq!(err.code(), ErrorCode::Validation);
    assert_eq!(err.to_string(), "orderedIds must contain the moved application");
}

#[tokio::test]
async fn a_missing_application_is_not_found() {
    let err = Fixture::new()
        .use_case()
        .execute(input("missing", ApplicationStatus::Applied, &["missing"]))
        .await
        .unwrap_err();
    assert_eq!(err.code(), ErrorCode::NotFound);
    assert_eq!(err.to_string(), "Application not found");
}

#[tokio::test]
async fn refuses_to_move_someone_elses_application() {
    let err = Fixture::new()
        .use_case()
        .execute(input("theirs", ApplicationStatus::Applied, &["theirs"]))
        .await
        .unwrap_err();
    assert_eq!(err.code(), ErrorCode::Forbidden);
}

#[tokio::test]
async fn refuses_a_list_naming_a_card_that_is_not_in_the_destination_column() {
    // Someone else's, one in another column, a trashed one and one that does
    // not exist are all the same answer.
    for foreign in ["theirs", "d", "gone", "missing"] {
        let fixture = Fixture::new();

        let err = fixture
            .use_case()
            .execute(input("a", ApplicationStatus::Applied, &["a", foreign]))
            .await
            .unwrap_err();

        assert_eq!(err.code(), ErrorCode::Forbidden, "{foreign}");
        assert_eq!(err.to_string(), "Forbidden");
        assert_eq!(fixture.transactions.runs(), 0, "nothing was written for {foreign}");
    }
}
