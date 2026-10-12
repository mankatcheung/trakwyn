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
const APPLICATION: &str = "app-1";

struct Fixture {
    applications: Arc<FakeApplicationRepository>,
    activity: Arc<FakeActivityLogRepository>,
    transactions: Arc<FakeTransactionManager>,
}

impl Fixture {
    fn new(application: Application) -> Self {
        Self {
            applications: Arc::new(FakeApplicationRepository::with(vec![application])),
            activity: Arc::default(),
            transactions: Arc::default(),
        }
    }

    fn use_case(&self) -> UpdateApplicationUseCase {
        UpdateApplicationUseCase {
            application_repository: self.applications.clone(),
            activity_log_repository: self.activity.clone(),
            generate_id: sequential_ids("id"),
            transaction_manager: self.transactions.clone(),
        }
    }

    async fn update(&self, input: UpdateApplicationInput) -> Application {
        self.use_case().execute(input).await.unwrap()
    }
}

fn at(seconds: i64) -> DateTime<Utc> {
    DateTime::<Utc>::from_timestamp(seconds, 0).unwrap()
}

fn draft() -> Application {
    Application { status: ApplicationStatus::Draft, ..application_owned_by(APPLICATION, OWNER) }
}

fn input() -> UpdateApplicationInput {
    UpdateApplicationInput {
        user_id: OWNER.to_string(),
        application_id: APPLICATION.to_string(),
        ..UpdateApplicationInput::default()
    }
}

#[tokio::test]
async fn fails_when_the_application_does_not_exist() {
    let fixture = Fixture::new(draft());

    let err = fixture
        .use_case()
        .execute(UpdateApplicationInput { application_id: "missing".to_string(), ..input() })
        .await
        .unwrap_err();

    assert_eq!(err.code(), ErrorCode::NotFound);
    assert_eq!(err.to_string(), "Application not found");
}

#[tokio::test]
async fn refuses_someone_elses_application() {
    let fixture = Fixture::new(draft());

    let err = fixture
        .use_case()
        .execute(UpdateApplicationInput {
            user_id: STRANGER.to_string(),
            company: Some("Hijacked".to_string()),
            ..input()
        })
        .await
        .unwrap_err();

    assert_eq!(err.code(), ErrorCode::Forbidden);
    assert_eq!(fixture.applications.all()[0].company, "Acme");
    assert!(fixture.activity.entries().is_empty());
}

#[tokio::test]
async fn writes_the_named_fields_in_one_transaction() {
    let fixture = Fixture::new(draft());

    let updated = fixture
        .update(UpdateApplicationInput {
            company: Some("Globex".to_string()),
            location: Some(Some("Remote".to_string())),
            tags: Some(vec!["remote".to_string()]),
            ..input()
        })
        .await;

    assert_eq!(updated.company, "Globex");
    assert_eq!(updated.role, "Engineer");
    assert_eq!(updated.location.as_deref(), Some("Remote"));
    assert_eq!(updated.tags, vec!["remote"]);
    assert_eq!(fixture.applications.all(), vec![updated]);
    assert_eq!(fixture.transactions.runs(), 1);
}

#[tokio::test]
async fn stamps_applied_at_the_first_time_the_status_becomes_applied() {
    let fixture = Fixture::new(draft());

    let updated = fixture
        .update(UpdateApplicationInput { status: Some(ApplicationStatus::Applied), ..input() })
        .await;

    assert!(updated.applied_at.is_some());
}

#[tokio::test]
async fn keeps_an_applied_at_that_is_already_set() {
    let fixture = Fixture::new(Application { applied_at: Some(at(100)), ..draft() });

    let updated = fixture
        .update(UpdateApplicationInput { status: Some(ApplicationStatus::Applied), ..input() })
        .await;

    assert_eq!(updated.applied_at, Some(at(100)));
}

#[tokio::test]
async fn other_transitions_do_not_stamp_applied_at() {
    let fixture = Fixture::new(draft());

    let updated = fixture
        .update(UpdateApplicationInput { status: Some(ApplicationStatus::Rejected), ..input() })
        .await;

    assert_eq!(updated.applied_at, None);
}

#[tokio::test]
async fn a_status_change_puts_the_card_on_top_of_its_new_column() {
    let fixture = Fixture::new(Application { board_position: 4, ..draft() });

    let updated = fixture
        .update(UpdateApplicationInput { status: Some(ApplicationStatus::Applied), ..input() })
        .await;

    assert_eq!(updated.board_position, 0);
}

#[tokio::test]
async fn an_unchanged_status_leaves_the_board_position_alone() {
    let fixture = Fixture::new(Application { board_position: 4, ..draft() });

    let updated = fixture
        .update(UpdateApplicationInput {
            status: Some(ApplicationStatus::Draft),
            starred: Some(true),
            ..input()
        })
        .await;

    assert_eq!(updated.board_position, 4);
}

#[tokio::test]
async fn a_status_change_is_logged_with_both_ends() {
    let fixture = Fixture::new(draft());

    fixture
        .update(UpdateApplicationInput {
            status: Some(ApplicationStatus::Applied),
            // Not reported separately: the status change is the entry.
            company: Some("Globex".to_string()),
            tags: Some(vec!["a".to_string()]),
            ..input()
        })
        .await;

    let entries = fixture.activity.entries();
    assert_eq!(entries.len(), 1);
    // The tag took the first id.
    assert_eq!(entries[0].id, "id-2");
    assert_eq!(entries[0].application_id, APPLICATION);
    assert_eq!(entries[0].actor_id, OWNER);
    assert_eq!(entries[0].event_type, ActivityEventType::StatusChanged);
    assert_eq!(entries[0].payload, r#"{"from":"draft","to":"applied"}"#);
}

#[tokio::test]
async fn values_equal_to_the_current_ones_log_nothing() {
    let fixture = Fixture::new(Application { follow_up_at: Some(at(100)), ..draft() });

    fixture
        .update(UpdateApplicationInput {
            company: Some("Acme".to_string()),
            status: Some(ApplicationStatus::Draft),
            job_url: Some(None),
            starred: Some(false),
            follow_up_at: Some(Some(at(100))),
            // Tags are never part of the entry.
            tags: Some(vec!["new".to_string()]),
            ..input()
        })
        .await;

    assert!(fixture.activity.entries().is_empty());
}

#[tokio::test]
async fn changed_fields_are_logged_by_name_in_a_fixed_order() {
    let fixture = Fixture::new(Application { source: Some("LinkedIn".to_string()), ..draft() });

    fixture
        .update(UpdateApplicationInput {
            follow_up_at: Some(Some(at(100))),
            starred: Some(true),
            source: Some(None),
            description: Some(Some("About the job".to_string())),
            salary_range: Some(Some("100k".to_string())),
            location: Some(Some("Remote".to_string())),
            job_url: Some(Some("https://acme.example".to_string())),
            role: Some("Manager".to_string()),
            company: Some("Globex".to_string()),
            ..input()
        })
        .await;

    let entries = fixture.activity.entries();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].event_type, ActivityEventType::FieldUpdated);
    assert_eq!(
        entries[0].payload,
        r#"{"fields":["company","role","jobUrl","location","salaryRange","description","source","starred","followUpAt"]}"#
    );
}

#[tokio::test]
async fn clearing_a_follow_up_date_is_a_change() {
    let fixture = Fixture::new(Application { follow_up_at: Some(at(100)), ..draft() });

    let updated =
        fixture.update(UpdateApplicationInput { follow_up_at: Some(None), ..input() }).await;

    assert_eq!(updated.follow_up_at, None);
    assert_eq!(fixture.activity.entries()[0].payload, r#"{"fields":["followUpAt"]}"#);
}
