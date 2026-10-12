use std::sync::Arc;

use chrono::{DateTime, Utc};

use super::*;
use crate::domain::activity_log::ActivityEventType;
use crate::domain::application::{Application, ApplicationStatus};
use crate::domain::interview_round::{InterviewRound, InterviewRoundOutcome, InterviewRoundType};
use crate::use_cases::errors::ErrorCode;
use crate::use_cases::test_support::{
    application_owned_by, sequential_ids, FakeActivityLogRepository, FakeApplicationRepository,
    FakeInterviewRoundRepository,
};

const OWNER: &str = "user-owner";
const STRANGER: &str = "user-stranger";
const APPLICATION: &str = "app-1";

struct Fixture {
    applications: Arc<FakeApplicationRepository>,
    rounds: Arc<FakeInterviewRoundRepository>,
    activity: Arc<FakeActivityLogRepository>,
}

impl Fixture {
    fn new(rounds: Vec<InterviewRound>) -> Self {
        Self::with_applications(vec![application_owned_by(APPLICATION, OWNER)], rounds)
    }

    fn with_applications(applications: Vec<Application>, rounds: Vec<InterviewRound>) -> Self {
        let applications = Arc::new(FakeApplicationRepository::with(applications));
        Self {
            rounds: Arc::new(
                FakeInterviewRoundRepository::with(rounds).with_applications(applications.clone()),
            ),
            applications,
            activity: Arc::default(),
        }
    }

    fn create(&self) -> CreateInterviewRoundUseCase {
        CreateInterviewRoundUseCase {
            application_repository: self.applications.clone(),
            interview_round_repository: self.rounds.clone(),
            activity_log_repository: Some(self.activity.clone()),
            generate_id: sequential_ids("id"),
        }
    }

    fn get(&self) -> GetInterviewRoundsUseCase {
        GetInterviewRoundsUseCase {
            application_repository: self.applications.clone(),
            interview_round_repository: self.rounds.clone(),
        }
    }

    fn update(&self) -> UpdateInterviewRoundUseCase {
        UpdateInterviewRoundUseCase {
            application_repository: self.applications.clone(),
            interview_round_repository: self.rounds.clone(),
        }
    }

    fn delete(&self) -> DeleteInterviewRoundUseCase {
        DeleteInterviewRoundUseCase {
            application_repository: self.applications.clone(),
            interview_round_repository: self.rounds.clone(),
        }
    }

    fn analytics(&self) -> GetInterviewRoundAnalyticsUseCase {
        GetInterviewRoundAnalyticsUseCase {
            application_repository: self.applications.clone(),
            interview_round_repository: self.rounds.clone(),
        }
    }
}

fn at(seconds: i64) -> DateTime<Utc> {
    DateTime::<Utc>::from_timestamp(seconds, 0).unwrap()
}

fn round(id: &str, application_id: &str, created_at_s: i64) -> InterviewRound {
    InterviewRound {
        id: id.to_string(),
        application_id: application_id.to_string(),
        r#type: InterviewRoundType::Phone,
        scheduled_at: None,
        completed_at: None,
        interviewer_name: Some("Jane Doe".to_string()),
        notes: None,
        outcome: InterviewRoundOutcome::Pending,
        push_notification_sent_at: None,
        created_at: at(created_at_s),
        updated_at: at(created_at_s),
    }
}

mod create {
    use super::*;

    fn input(user_id: &str, application_id: &str) -> CreateInterviewRoundInput {
        CreateInterviewRoundInput {
            user_id: user_id.to_string(),
            application_id: application_id.to_string(),
            ..Default::default()
        }
    }

    #[tokio::test]
    async fn defaults_the_type_and_outcome_when_they_are_omitted() {
        let fixture = Fixture::new(vec![]);

        let created = fixture.create().execute(input(OWNER, APPLICATION)).await.unwrap();

        assert_eq!(created.id, "id-1");
        assert_eq!(created.application_id, APPLICATION);
        assert_eq!(created.r#type, InterviewRoundType::Other);
        assert_eq!(created.outcome, InterviewRoundOutcome::Pending);
        assert_eq!(created.scheduled_at, None);
        assert_eq!(created.completed_at, None);
        assert_eq!(created.interviewer_name, None);
        assert_eq!(created.notes, None);
        assert_eq!(fixture.rounds.all(), vec![created]);
    }

    #[tokio::test]
    async fn passes_explicit_fields_through() {
        let fixture = Fixture::new(vec![]);

        let created = fixture
            .create()
            .execute(CreateInterviewRoundInput {
                r#type: Some(InterviewRoundType::Technical),
                scheduled_at: Some(at(1_000)),
                completed_at: Some(at(2_000)),
                interviewer_name: Some("Sam".to_string()),
                notes: Some("System design".to_string()),
                outcome: Some(InterviewRoundOutcome::Passed),
                ..input(OWNER, APPLICATION)
            })
            .await
            .unwrap();

        assert_eq!(created.r#type, InterviewRoundType::Technical);
        assert_eq!(created.scheduled_at, Some(at(1_000)));
        assert_eq!(created.completed_at, Some(at(2_000)));
        assert_eq!(created.interviewer_name.as_deref(), Some("Sam"));
        assert_eq!(created.notes.as_deref(), Some("System design"));
        assert_eq!(created.outcome, InterviewRoundOutcome::Passed);
    }

    #[tokio::test]
    async fn logs_the_activity_with_the_round_id_and_type() {
        let fixture = Fixture::new(vec![]);

        fixture
            .create()
            .execute(CreateInterviewRoundInput {
                r#type: Some(InterviewRoundType::Onsite),
                ..input(OWNER, APPLICATION)
            })
            .await
            .unwrap();

        let entries = fixture.activity.entries();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].id, "id-2");
        assert_eq!(entries[0].application_id, APPLICATION);
        assert_eq!(entries[0].actor_id, OWNER);
        assert_eq!(entries[0].event_type, ActivityEventType::InterviewAdded);
        assert_eq!(entries[0].payload, r#"{"roundId":"id-1","type":"onsite"}"#);
    }

    #[tokio::test]
    async fn works_without_an_activity_log() {
        let fixture = Fixture::new(vec![]);
        let use_case =
            CreateInterviewRoundUseCase { activity_log_repository: None, ..fixture.create() };

        let created = use_case.execute(input(OWNER, APPLICATION)).await.unwrap();

        assert_eq!(fixture.rounds.all(), vec![created]);
        assert!(fixture.activity.entries().is_empty());
    }

    #[tokio::test]
    async fn fails_when_the_application_does_not_exist() {
        let fixture = Fixture::new(vec![]);

        let err = fixture.create().execute(input(OWNER, "missing")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Application not found");
        assert!(fixture.rounds.all().is_empty());
    }

    #[tokio::test]
    async fn refuses_someone_elses_application() {
        let fixture = Fixture::new(vec![]);

        let err = fixture.create().execute(input(STRANGER, APPLICATION)).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Forbidden);
        assert!(fixture.rounds.all().is_empty());
        assert!(fixture.activity.entries().is_empty());
    }
}

mod get {
    use super::*;

    fn input(user_id: &str, application_id: &str) -> GetInterviewRoundsInput {
        GetInterviewRoundsInput {
            user_id: user_id.to_string(),
            application_id: application_id.to_string(),
        }
    }

    #[tokio::test]
    async fn returns_the_applications_rounds_oldest_first() {
        let fixture = Fixture::new(vec![
            round("second", APPLICATION, 200),
            round("first", APPLICATION, 100),
            round("other", "app-2", 50),
        ]);

        let rounds = fixture.get().execute(input(OWNER, APPLICATION)).await.unwrap();

        let ids: Vec<&str> = rounds.iter().map(|round| round.id.as_str()).collect();
        assert_eq!(ids, vec!["first", "second"]);
    }

    #[tokio::test]
    async fn fails_when_the_application_does_not_exist() {
        let err = Fixture::new(vec![]).get().execute(input(OWNER, "missing")).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Application not found");
    }

    #[tokio::test]
    async fn refuses_someone_elses_application() {
        let fixture = Fixture::new(vec![round("r", APPLICATION, 100)]);
        let err = fixture.get().execute(input(STRANGER, APPLICATION)).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::Forbidden);
    }
}

mod update {
    use super::*;

    fn input(user_id: &str, round_id: &str) -> UpdateInterviewRoundInput {
        UpdateInterviewRoundInput {
            user_id: user_id.to_string(),
            round_id: round_id.to_string(),
            outcome: Some(InterviewRoundOutcome::Passed),
            completed_at: Some(Some(at(5_000))),
            interviewer_name: Some(None),
            ..Default::default()
        }
    }

    #[tokio::test]
    async fn writes_only_the_named_fields() {
        let fixture = Fixture::new(vec![round("r", APPLICATION, 100)]);

        let updated = fixture.update().execute(input(OWNER, "r")).await.unwrap();

        assert_eq!(updated.outcome, InterviewRoundOutcome::Passed);
        assert_eq!(updated.completed_at, Some(at(5_000)));
        assert_eq!(updated.interviewer_name, None);
        assert_eq!(updated.r#type, InterviewRoundType::Phone);
        assert_eq!(fixture.rounds.all(), vec![updated]);
    }

    #[tokio::test]
    async fn fails_when_the_round_does_not_exist() {
        let err = Fixture::new(vec![]).update().execute(input(OWNER, "missing")).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Interview round not found");
    }

    #[tokio::test]
    async fn refuses_a_round_on_someone_elses_application() {
        let fixture = Fixture::new(vec![round("r", APPLICATION, 100)]);

        let err = fixture.update().execute(input(STRANGER, "r")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Forbidden);
        assert_eq!(fixture.rounds.all()[0].outcome, InterviewRoundOutcome::Pending);
    }

    #[tokio::test]
    async fn refuses_a_round_whose_application_is_gone() {
        let fixture = Fixture::new(vec![round("orphan", "app-trashed", 100)]);
        let err = fixture.update().execute(input(OWNER, "orphan")).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::Forbidden);
    }
}

mod delete {
    use super::*;

    fn input(user_id: &str, round_id: &str) -> DeleteInterviewRoundInput {
        DeleteInterviewRoundInput { user_id: user_id.to_string(), round_id: round_id.to_string() }
    }

    #[tokio::test]
    async fn removes_the_round() {
        let fixture = Fixture::new(vec![round("r", APPLICATION, 100)]);

        fixture.delete().execute(input(OWNER, "r")).await.unwrap();

        assert!(fixture.rounds.all().is_empty());
    }

    #[tokio::test]
    async fn fails_when_the_round_does_not_exist() {
        let err = Fixture::new(vec![]).delete().execute(input(OWNER, "missing")).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Interview round not found");
    }

    #[tokio::test]
    async fn refuses_a_round_on_someone_elses_application() {
        let fixture = Fixture::new(vec![round("r", APPLICATION, 100)]);

        let err = fixture.delete().execute(input(STRANGER, "r")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Forbidden);
        assert_eq!(fixture.rounds.all().len(), 1);
    }

    #[tokio::test]
    async fn refuses_a_round_whose_application_is_gone() {
        let fixture = Fixture::new(vec![round("orphan", "app-trashed", 100)]);
        let err = fixture.delete().execute(input(OWNER, "orphan")).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::Forbidden);
        assert_eq!(fixture.rounds.all().len(), 1);
    }
}

mod analytics {
    use super::*;

    fn application(id: &str, status: ApplicationStatus) -> Application {
        Application { status, ..application_owned_by(id, OWNER) }
    }

    fn typed(
        id: &str,
        application_id: &str,
        round_type: InterviewRoundType,
        outcome: InterviewRoundOutcome,
    ) -> InterviewRound {
        InterviewRound { r#type: round_type, outcome, ..round(id, application_id, 100) }
    }

    /// `count` rounds on `application_id`.
    fn rounds_on(application_id: &str, count: usize) -> Vec<InterviewRound> {
        (0..count).map(|n| round(&format!("{application_id}-r{n}"), application_id, 100)).collect()
    }

    async fn run(fixture: &Fixture) -> InterviewRoundAnalytics {
        fixture
            .analytics()
            .execute(GetInterviewRoundAnalyticsInput { user_id: OWNER.to_string() })
            .await
            .unwrap()
    }

    const EMPTY: RoundsToTerminalStat =
        RoundsToTerminalStat { average: None, median: None, sample_size: 0 };

    #[tokio::test]
    async fn is_empty_when_there_is_no_data() {
        let fixture = Fixture::with_applications(vec![], vec![]);

        let analytics = run(&fixture).await;

        assert_eq!(
            analytics,
            InterviewRoundAnalytics {
                by_type: vec![],
                rounds_to_offer: EMPTY,
                rounds_to_rejection: EMPTY
            }
        );
    }

    #[tokio::test]
    async fn counts_outcomes_per_type_and_leaves_out_types_with_no_round() {
        use InterviewRoundOutcome::{Cancelled, Failed, Passed, Pending};
        use InterviewRoundType::{Phone, Technical};
        let fixture = Fixture::new(vec![
            typed("r1", APPLICATION, Technical, Passed),
            typed("r2", APPLICATION, Phone, Passed),
            typed("r3", APPLICATION, Phone, Passed),
            typed("r4", APPLICATION, Phone, Failed),
            typed("r5", APPLICATION, Technical, Pending),
            typed("r6", APPLICATION, Technical, Cancelled),
        ]);

        let analytics = run(&fixture).await;

        // In the order the types are declared, not the order rounds appear.
        assert_eq!(
            analytics.by_type,
            vec![
                InterviewRoundTypeStat {
                    r#type: Phone,
                    passed: 2,
                    failed: 1,
                    pending: 0,
                    cancelled: 0
                },
                InterviewRoundTypeStat {
                    r#type: Technical,
                    passed: 1,
                    failed: 0,
                    pending: 1,
                    cancelled: 1
                },
            ]
        );
    }

    #[tokio::test]
    async fn rounds_to_offer_covers_offered_and_accepted_applications() {
        let fixture = Fixture::with_applications(
            vec![
                application("offered", ApplicationStatus::Offered),
                application("accepted", ApplicationStatus::Accepted),
                application("another", ApplicationStatus::Offered),
                application("interviewing", ApplicationStatus::Interviewing),
            ],
            [
                rounds_on("offered", 2),
                rounds_on("accepted", 4),
                rounds_on("another", 5),
                rounds_on("interviewing", 9),
            ]
            .concat(),
        );

        let analytics = run(&fixture).await;

        assert_eq!(
            analytics.rounds_to_offer,
            RoundsToTerminalStat { average: Some(11.0 / 3.0), median: Some(4.0), sample_size: 3 }
        );
        assert_eq!(analytics.rounds_to_rejection, EMPTY);
    }

    #[tokio::test]
    async fn rounds_to_rejection_takes_the_mean_of_the_middle_pair_and_skips_withdrawn() {
        let fixture = Fixture::with_applications(
            vec![
                application("rejected-a", ApplicationStatus::Rejected),
                application("rejected-b", ApplicationStatus::Rejected),
                application("withdrawn", ApplicationStatus::Withdrawn),
            ],
            [rounds_on("rejected-a", 1), rounds_on("rejected-b", 4), rounds_on("withdrawn", 7)]
                .concat(),
        );

        let analytics = run(&fixture).await;

        assert_eq!(
            analytics.rounds_to_rejection,
            RoundsToTerminalStat { average: Some(2.5), median: Some(2.5), sample_size: 2 }
        );
        assert_eq!(analytics.rounds_to_offer, EMPTY);
    }

    #[tokio::test]
    async fn an_offered_application_with_no_rounds_is_not_a_sample() {
        let fixture = Fixture::with_applications(
            vec![
                application("no-rounds", ApplicationStatus::Offered),
                application("with-rounds", ApplicationStatus::Offered),
            ],
            rounds_on("with-rounds", 3),
        );

        let analytics = run(&fixture).await;

        assert_eq!(
            analytics.rounds_to_offer,
            RoundsToTerminalStat { average: Some(3.0), median: Some(3.0), sample_size: 1 }
        );
    }

    #[tokio::test]
    async fn another_users_rounds_are_not_counted() {
        let fixture = Fixture::with_applications(
            vec![
                application("mine", ApplicationStatus::Rejected),
                Application {
                    status: ApplicationStatus::Rejected,
                    ..application_owned_by("theirs", STRANGER)
                },
            ],
            [rounds_on("mine", 1), rounds_on("theirs", 6)].concat(),
        );

        let analytics = run(&fixture).await;

        assert_eq!(analytics.rounds_to_rejection.sample_size, 1);
        assert_eq!(analytics.by_type[0].pending, 1);
    }
}
