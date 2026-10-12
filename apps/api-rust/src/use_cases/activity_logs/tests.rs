use std::sync::Arc;

use chrono::{DateTime, TimeDelta, Utc};

use super::*;
use crate::domain::activity_log::{ActivityEventType, ActivityLog};
use crate::domain::application::{Application, ApplicationStatus};
use crate::use_cases::errors::ErrorCode;
use crate::use_cases::test_support::{
    application_owned_by, FakeActivityLogRepository, FakeApplicationRepository,
};

const OWNER: &str = "user-owner";

fn day(n: i64) -> DateTime<Utc> {
    DateTime::<Utc>::UNIX_EPOCH + TimeDelta::days(n)
}

fn log(application_id: &str, event_type: ActivityEventType, payload: &str, on: i64) -> ActivityLog {
    ActivityLog {
        id: format!("log-{application_id}-{on}"),
        application_id: application_id.to_string(),
        actor_id: OWNER.to_string(),
        event_type,
        payload: payload.to_string(),
        created_at: day(on),
    }
}

fn status_change(application_id: &str, from: &str, to: &str, on: i64) -> ActivityLog {
    let payload = format!(r#"{{"from":"{from}","to":"{to}"}}"#);
    log(application_id, ActivityEventType::StatusChanged, &payload, on)
}

mod get_activity_logs {
    use super::*;

    fn use_case() -> GetActivityLogsUseCase {
        GetActivityLogsUseCase {
            application_repository: Arc::new(FakeApplicationRepository::with(vec![
                application_owned_by("app-1", OWNER),
            ])),
            activity_log_repository: Arc::new(FakeActivityLogRepository::with(vec![
                log("app-1", ActivityEventType::NoteAdded, r#"{"noteId":"n"}"#, 1),
                status_change("app-1", "draft", "applied", 2),
                log("app-2", ActivityEventType::NoteAdded, r#"{"noteId":"m"}"#, 3),
            ])),
        }
    }

    fn input(user_id: &str, application_id: &str) -> GetActivityLogsInput {
        GetActivityLogsInput {
            application_id: application_id.to_string(),
            user_id: user_id.to_string(),
        }
    }

    #[tokio::test]
    async fn returns_the_applications_entries() {
        let logs = use_case().execute(input(OWNER, "app-1")).await.unwrap();

        assert_eq!(logs.len(), 2);
        assert!(logs.iter().all(|log| log.application_id == "app-1"));
    }

    #[tokio::test]
    async fn fails_when_the_application_does_not_exist() {
        let err = use_case().execute(input(OWNER, "missing")).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Application not found");
    }

    #[tokio::test]
    async fn refuses_someone_elses_application() {
        let err = use_case().execute(input("user-stranger", "app-1")).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::Forbidden);
    }
}

mod response_time {
    use super::*;

    fn application(id: &str, created_on: i64, applied_on: Option<i64>) -> Application {
        Application {
            created_at: day(created_on),
            applied_at: applied_on.map(day),
            ..application_owned_by(id, OWNER)
        }
    }

    async fn run(applications: Vec<Application>, logs: Vec<ActivityLog>) -> ResponseTimeAnalytics {
        GetResponseTimeAnalyticsUseCase {
            application_repository: Arc::new(FakeApplicationRepository::with(applications)),
            activity_log_repository: Arc::new(FakeActivityLogRepository::with(logs)),
        }
        .execute(GetResponseTimeAnalyticsInput { user_id: OWNER.to_string() })
        .await
        .unwrap()
    }

    #[tokio::test]
    async fn no_data_gives_empty_stats() {
        let analytics = run(vec![], vec![]).await;

        assert!(analytics.time_in_stage.is_empty());
        assert_eq!(
            analytics.time_to_first_response,
            TimeToResponseStat { average_days: None, median_days: None, sample_size: 0 }
        );
    }

    #[tokio::test]
    async fn measures_each_stage_from_creation_through_every_transition() {
        let analytics = run(
            vec![application("app-1", 0, Some(2))],
            // Out of order on purpose: the entries are sorted by time.
            vec![
                status_change("app-1", "applied", "interviewing", 7),
                status_change("app-1", "draft", "applied", 2),
            ],
        )
        .await;

        assert_eq!(
            analytics.time_in_stage,
            vec![
                StageDurationStat {
                    status: ApplicationStatus::Draft,
                    average_days: Some(2.0),
                    median_days: Some(2.0),
                    sample_size: 1,
                },
                StageDurationStat {
                    status: ApplicationStatus::Applied,
                    average_days: Some(5.0),
                    median_days: Some(5.0),
                    sample_size: 1,
                },
            ]
        );
    }

    #[tokio::test]
    async fn the_stage_an_application_is_still_in_contributes_nothing() {
        let analytics = run(
            vec![application("app-1", 0, Some(1))],
            vec![status_change("app-1", "draft", "applied", 1)],
        )
        .await;

        let stages: Vec<ApplicationStatus> =
            analytics.time_in_stage.iter().map(|stat| stat.status).collect();
        assert_eq!(stages, vec![ApplicationStatus::Draft]);
    }

    #[tokio::test]
    async fn averages_and_medians_across_applications_most_sampled_stage_first() {
        let analytics = run(
            vec![
                application("app-1", 0, Some(0)),
                application("app-2", 0, Some(0)),
                application("app-3", 0, Some(0)),
            ],
            vec![
                status_change("app-1", "applied", "interviewing", 1),
                status_change("app-1", "interviewing", "offered", 5),
                status_change("app-2", "applied", "rejected", 2),
                status_change("app-3", "applied", "rejected", 9),
            ],
        )
        .await;

        assert_eq!(analytics.time_in_stage.len(), 2);
        let applied = &analytics.time_in_stage[0];
        assert_eq!(applied.status, ApplicationStatus::Applied);
        assert_eq!(applied.sample_size, 3);
        assert_eq!(applied.average_days, Some(4.0));
        assert_eq!(applied.median_days, Some(2.0));
        assert_eq!(analytics.time_in_stage[1].status, ApplicationStatus::Interviewing);
        assert_eq!(analytics.time_in_stage[1].average_days, Some(4.0));
    }

    #[tokio::test]
    async fn an_even_sample_takes_the_mean_of_the_middle_two() {
        let analytics = run(
            vec![application("app-1", 0, Some(0)), application("app-2", 0, Some(0))],
            vec![
                status_change("app-1", "applied", "rejected", 1),
                status_change("app-2", "applied", "rejected", 4),
            ],
        )
        .await;

        assert_eq!(analytics.time_to_first_response.median_days, Some(2.5));
        assert_eq!(analytics.time_to_first_response.average_days, Some(2.5));
    }

    #[tokio::test]
    async fn time_to_first_response_runs_from_applied_at_to_leaving_applied() {
        let analytics = run(
            vec![application("app-1", 0, Some(3))],
            vec![
                status_change("app-1", "draft", "applied", 3),
                log("app-1", ActivityEventType::NoteAdded, r#"{"noteId":"n"}"#, 4),
                status_change("app-1", "applied", "interviewing", 10),
            ],
        )
        .await;

        assert_eq!(
            analytics.time_to_first_response,
            TimeToResponseStat { average_days: Some(7.0), median_days: Some(7.0), sample_size: 1 }
        );
    }

    #[tokio::test]
    async fn applications_never_applied_or_never_answered_are_left_out_of_first_response() {
        let analytics = run(
            vec![application("never-applied", 0, None), application("no-answer", 0, Some(1))],
            vec![
                status_change("never-applied", "applied", "rejected", 5),
                status_change("no-answer", "draft", "applied", 1),
            ],
        )
        .await;

        assert_eq!(analytics.time_to_first_response.sample_size, 0);
    }

    #[tokio::test]
    async fn other_events_and_malformed_payloads_are_ignored() {
        let analytics = run(
            vec![application("app-1", 0, Some(0))],
            vec![
                log(
                    "app-1",
                    ActivityEventType::NoteAdded,
                    r#"{"from":"applied","to":"offered"}"#,
                    1,
                ),
                log("app-1", ActivityEventType::StatusChanged, "not json", 2),
                log("app-1", ActivityEventType::StatusChanged, r#"{"from":"applied"}"#, 3),
                log("app-1", ActivityEventType::StatusChanged, r#"{"from":1,"to":2}"#, 4),
            ],
        )
        .await;

        assert!(analytics.time_in_stage.is_empty());
        assert_eq!(analytics.time_to_first_response.sample_size, 0);
    }

    #[tokio::test]
    async fn a_trashed_applications_history_is_not_counted() {
        let trashed = Application { deleted_at: Some(day(20)), ..application("gone", 0, Some(0)) };

        let analytics =
            run(vec![trashed], vec![status_change("gone", "applied", "rejected", 5)]).await;

        assert!(analytics.time_in_stage.is_empty());
    }
}
