use std::sync::Arc;

use chrono::{DateTime, Utc};

use super::*;
use crate::domain::application::Application;
use crate::domain::interview_round::{InterviewRound, InterviewRoundOutcome, InterviewRoundType};
use crate::use_cases::test_support::{
    application_owned_by, FakeApplicationRepository, FakeInterviewRoundRepository,
};

const OWNER: &str = "user-owner";

fn at(seconds: i64) -> DateTime<Utc> {
    DateTime::<Utc>::from_timestamp(seconds, 0).unwrap()
}

fn round(id: &str, application_id: &str, scheduled_at: Option<i64>) -> InterviewRound {
    InterviewRound {
        id: id.to_string(),
        application_id: application_id.to_string(),
        r#type: InterviewRoundType::Technical,
        scheduled_at: scheduled_at.map(at),
        completed_at: None,
        interviewer_name: None,
        notes: None,
        outcome: InterviewRoundOutcome::Pending,
        push_notification_sent_at: None,
        created_at: at(0),
        updated_at: at(0),
    }
}

async fn events(applications: Vec<Application>, rounds: Vec<InterviewRound>) -> Vec<CalendarEvent> {
    let applications = Arc::new(FakeApplicationRepository::with(applications));
    GetCalendarEventsUseCase {
        application_repository: applications.clone(),
        interview_round_repository: Arc::new(
            FakeInterviewRoundRepository::with(rounds).with_applications(applications),
        ),
    }
    .execute(GetCalendarEventsInput { user_id: OWNER.to_string() })
    .await
    .unwrap()
}

#[tokio::test]
async fn nothing_dated_means_no_events() {
    assert!(events(vec![application_owned_by("app-1", OWNER)], vec![]).await.is_empty());
}

#[tokio::test]
async fn an_applied_date_becomes_an_applied_event() {
    let application =
        Application { applied_at: Some(at(100)), ..application_owned_by("app-1", OWNER) };

    let events = events(vec![application], vec![]).await;

    assert_eq!(
        events,
        vec![CalendarEvent {
            id: "app-1-applied".to_string(),
            application_id: "app-1".to_string(),
            company: "Acme".to_string(),
            role: "Engineer".to_string(),
            r#type: CalendarEventType::Applied,
            date: at(100),
            interview_round_type: None,
        }]
    );
}

#[tokio::test]
async fn a_follow_up_date_becomes_a_follow_up_event() {
    let application =
        Application { follow_up_at: Some(at(200)), ..application_owned_by("app-1", OWNER) };

    let events = events(vec![application], vec![]).await;

    assert_eq!(events.len(), 1);
    assert_eq!(events[0].id, "app-1-follow-up");
    assert_eq!(events[0].r#type, CalendarEventType::FollowUp);
    assert_eq!(events[0].date, at(200));
}

#[tokio::test]
async fn a_scheduled_round_becomes_an_interview_event_carrying_its_type() {
    let events = events(
        vec![application_owned_by("app-1", OWNER)],
        vec![round("round-1", "app-1", Some(300)), round("unscheduled", "app-1", None)],
    )
    .await;

    assert_eq!(
        events,
        vec![CalendarEvent {
            id: "round-1".to_string(),
            application_id: "app-1".to_string(),
            company: "Acme".to_string(),
            role: "Engineer".to_string(),
            r#type: CalendarEventType::Interview,
            date: at(300),
            interview_round_type: Some(InterviewRoundType::Technical),
        }]
    );
}

#[tokio::test]
async fn rounds_of_trashed_and_foreign_applications_are_left_out() {
    let trashed = Application { deleted_at: Some(at(1)), ..application_owned_by("gone", OWNER) };

    let events = events(
        vec![trashed, application_owned_by("theirs", "user-stranger")],
        vec![round("r1", "gone", Some(300)), round("r2", "theirs", Some(300))],
    )
    .await;

    assert!(events.is_empty());
}

#[tokio::test]
async fn everything_is_merged_earliest_first() {
    let first = Application {
        applied_at: Some(at(300)),
        follow_up_at: Some(at(100)),
        ..application_owned_by("app-1", OWNER)
    };
    let second = Application { applied_at: Some(at(200)), ..application_owned_by("app-2", OWNER) };

    let events = events(vec![first, second], vec![round("round-1", "app-2", Some(250))]).await;

    let ids: Vec<&str> = events.iter().map(|event| event.id.as_str()).collect();
    assert_eq!(ids, vec!["app-1-follow-up", "app-2-applied", "round-1", "app-1-applied"]);
}
