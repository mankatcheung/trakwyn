use std::sync::Arc;

use chrono::{DateTime, TimeDelta, Utc};

use super::*;
use crate::domain::application::{Application, ApplicationStatus};
use crate::domain::user::{DigestFrequency, User};
use crate::use_cases::clock::now;
use crate::use_cases::ports::email_service::DigestFrequency as EmailFrequency;
use crate::use_cases::ports::WeeklyDigestData;
use crate::use_cases::test_support::{
    application_owned_by, user_with_email, FakeApplicationRepository, FakeEmailService,
    FakeUserRepository, SentEmail,
};

fn ago(delta: TimeDelta) -> DateTime<Utc> {
    now() - delta
}

fn user(id: &str) -> User {
    user_with_email(id, &format!("{id}@test.com"))
}

fn app(id: &str, user_id: &str) -> Application {
    Application { created_at: ago(TimeDelta::days(30)), ..application_owned_by(id, user_id) }
}

struct Fixture {
    users: Arc<FakeUserRepository>,
    emails: Arc<FakeEmailService>,
    use_case: SendWeeklyDigestUseCase,
}

fn fixture(users: Vec<User>, applications: Vec<Application>) -> Fixture {
    let users = Arc::new(FakeUserRepository::with(users));
    let emails = Arc::new(FakeEmailService::default());
    let use_case = SendWeeklyDigestUseCase {
        user_repository: users.clone(),
        application_repository: Arc::new(FakeApplicationRepository::with(applications)),
        email_service: emails.clone(),
    };
    Fixture { users, emails, use_case }
}

fn last_digest(users: &FakeUserRepository, id: &str) -> Option<DateTime<Utc>> {
    users.all().into_iter().find(|u| u.id == id).and_then(|u| u.last_digest_sent_at)
}

fn digest_of(email: &SentEmail) -> (&WeeklyDigestData, EmailFrequency) {
    match email {
        SentEmail::WeeklyDigest { data, frequency, .. } => (data, *frequency),
        other => panic!("not a digest: {other:?}"),
    }
}

#[tokio::test]
async fn reports_zero_when_there_are_no_users() {
    let f = fixture(vec![], vec![]);
    let summary = f.use_case.execute().await.unwrap();
    assert_eq!(summary, DigestSummary { total_users: 0, sent: 0, skipped: 0, failed: 0 });
}

#[tokio::test]
async fn skips_a_user_with_no_applications() {
    let f = fixture(vec![user("u1")], vec![]);
    let summary = f.use_case.execute().await.unwrap();
    assert_eq!(summary, DigestSummary { total_users: 1, sent: 0, skipped: 1, failed: 0 });
    assert!(f.emails.sent().is_empty());
}

#[tokio::test]
async fn skips_a_weekly_user_who_disabled_the_digest() {
    let u = User { weekly_digest_enabled: false, ..user("u1") };
    let f = fixture(vec![u], vec![app("a1", "u1")]);
    let summary = f.use_case.execute().await.unwrap();
    assert_eq!(summary.skipped, 1);
    assert!(f.emails.sent().is_empty());
}

#[tokio::test]
async fn skips_a_user_whose_frequency_is_off() {
    let u = User { digest_frequency: DigestFrequency::Off, ..user("u1") };
    let f = fixture(vec![u], vec![app("a1", "u1")]);
    assert_eq!(f.use_case.execute().await.unwrap().skipped, 1);
}

#[tokio::test]
async fn a_daily_user_gets_a_digest_even_with_the_weekly_flag_off() {
    let u = User {
        digest_frequency: DigestFrequency::Daily,
        weekly_digest_enabled: false,
        ..user("u1")
    };
    let f = fixture(vec![u], vec![app("a1", "u1")]);
    assert_eq!(f.use_case.execute().await.unwrap().sent, 1);
}

#[tokio::test]
async fn sends_a_daily_digest_after_the_daily_resend_window() {
    let u = User {
        digest_frequency: DigestFrequency::Daily,
        last_digest_sent_at: Some(ago(TimeDelta::hours(24))),
        ..user("u1")
    };
    let f = fixture(vec![u], vec![app("a1", "u1")]);

    f.use_case.execute().await.unwrap();

    let sent = f.emails.sent();
    assert_eq!(sent.len(), 1);
    assert_eq!(digest_of(&sent[0]).1, EmailFrequency::Daily);
}

#[tokio::test]
async fn holds_a_daily_digest_back_inside_the_daily_window() {
    let u = User {
        digest_frequency: DigestFrequency::Daily,
        last_digest_sent_at: Some(ago(TimeDelta::hours(22))),
        ..user("u1")
    };
    let f = fixture(vec![u], vec![app("a1", "u1")]);
    assert_eq!(f.use_case.execute().await.unwrap().skipped, 1);
}

#[tokio::test]
async fn sends_one_digest_per_user_with_applications_and_stamps_them() {
    let f = fixture(vec![user("u1"), user("u2")], vec![app("a1", "u1")]);

    let summary = f.use_case.execute().await.unwrap();

    assert_eq!(summary, DigestSummary { total_users: 2, sent: 1, skipped: 1, failed: 0 });
    let sent = f.emails.sent();
    assert_eq!(sent.len(), 1);
    assert_eq!(sent[0].to(), "u1@test.com");
    assert_eq!(digest_of(&sent[0]).1, EmailFrequency::Weekly);
    assert!(last_digest(&f.users, "u1").is_some());
    assert!(last_digest(&f.users, "u2").is_none());
}

#[tokio::test]
async fn skips_a_user_digested_within_the_weekly_window() {
    let u = User { last_digest_sent_at: Some(ago(TimeDelta::days(1))), ..user("u1") };
    let f = fixture(vec![u], vec![app("a1", "u1")]);

    let summary = f.use_case.execute().await.unwrap();

    assert_eq!(summary, DigestSummary { total_users: 1, sent: 0, skipped: 1, failed: 0 });
    assert!(f.emails.sent().is_empty());
}

#[tokio::test]
async fn sends_again_once_the_weekly_window_has_elapsed() {
    let u = User { last_digest_sent_at: Some(ago(TimeDelta::days(7))), ..user("u1") };
    let f = fixture(vec![u], vec![app("a1", "u1")]);
    assert_eq!(f.use_case.execute().await.unwrap().sent, 1);
}

#[tokio::test]
async fn counts_a_user_whose_email_failed_and_does_not_stamp_them() {
    let f = fixture(vec![user("u1")], vec![app("a1", "u1")]);
    f.emails.fail_with("Brevo timeout");

    let summary = f.use_case.execute().await.unwrap();

    assert_eq!(summary, DigestSummary { total_users: 1, sent: 0, skipped: 0, failed: 1 });
    assert!(last_digest(&f.users, "u1").is_none());
}

#[tokio::test]
async fn names_new_applications_from_the_last_seven_days() {
    let fresh = Application {
        created_at: ago(TimeDelta::days(2)),
        company: "NewCo".into(),
        ..app("a1", "u1")
    };
    let old = Application { company: "OldCo".into(), ..app("a2", "u1") };
    let f = fixture(vec![user("u1")], vec![fresh, old]);

    f.use_case.execute().await.unwrap();

    let sent = f.emails.sent();
    let (data, _) = digest_of(&sent[0]);
    assert_eq!(data.total_applications, 2);
    assert_eq!(data.new_this_week.len(), 1);
    assert_eq!(data.new_this_week[0].company, "NewCo");
}

#[tokio::test]
async fn a_daily_digest_looks_back_and_ahead_one_day() {
    let u = User { digest_frequency: DigestFrequency::Daily, ..user("u1") };
    let two_days_old = Application { created_at: ago(TimeDelta::days(2)), ..app("a1", "u1") };
    let hour_old = Application { created_at: ago(TimeDelta::hours(1)), ..app("a2", "u1") };
    let in_hours =
        Application { follow_up_at: Some(now() + TimeDelta::hours(5)), ..app("a3", "u1") };
    let in_two_days =
        Application { follow_up_at: Some(now() + TimeDelta::days(2)), ..app("a4", "u1") };
    let f = fixture(vec![u], vec![two_days_old, hour_old, in_hours, in_two_days]);

    f.use_case.execute().await.unwrap();

    let sent = f.emails.sent();
    let (data, _) = digest_of(&sent[0]);
    assert_eq!(data.new_this_week.len(), 1);
    assert_eq!(data.upcoming_follow_ups.len(), 1);
}

#[tokio::test]
async fn lists_overdue_follow_ups_but_not_for_closed_applications() {
    let overdue = |id: &str, status| Application {
        follow_up_at: Some(ago(TimeDelta::days(1))),
        status,
        ..app(id, "u1")
    };
    let f = fixture(
        vec![user("u1")],
        vec![
            overdue("applied", ApplicationStatus::Applied),
            overdue("rejected", ApplicationStatus::Rejected),
            overdue("accepted", ApplicationStatus::Accepted),
            overdue("withdrawn", ApplicationStatus::Withdrawn),
        ],
    );

    f.use_case.execute().await.unwrap();

    let sent = f.emails.sent();
    let (data, _) = digest_of(&sent[0]);
    assert_eq!(data.overdue_follow_ups.len(), 1);
}

#[tokio::test]
async fn lists_upcoming_follow_ups_inside_the_period_only() {
    let due = |id: &str, delta: TimeDelta| Application {
        follow_up_at: Some(now() + delta),
        ..app(id, "u1")
    };
    let f = fixture(
        vec![user("u1")],
        vec![due("soon", TimeDelta::days(3)), due("later", TimeDelta::days(10))],
    );

    f.use_case.execute().await.unwrap();

    let sent = f.emails.sent();
    let (data, _) = digest_of(&sent[0]);
    assert_eq!(data.upcoming_follow_ups.len(), 1);
    assert_eq!(data.overdue_follow_ups.len(), 0);
}

#[tokio::test]
async fn breaks_the_applications_down_by_status_in_first_seen_order() {
    let with_status = |id: &str, status| Application { status, ..app(id, "u1") };
    let f = fixture(
        vec![user("u1")],
        vec![
            with_status("a", ApplicationStatus::Applied),
            with_status("b", ApplicationStatus::Draft),
            with_status("c", ApplicationStatus::Applied),
        ],
    );

    f.use_case.execute().await.unwrap();

    let sent = f.emails.sent();
    let (data, _) = digest_of(&sent[0]);
    assert_eq!(data.by_status, vec![("applied".to_string(), 2), ("draft".to_string(), 1)]);
}

#[tokio::test]
async fn reports_the_weekly_goal_progress() {
    let u = User { weekly_application_goal: 1, ..user("u1") };
    let this_week = Application { created_at: now(), ..app("a1", "u1") };
    let f = fixture(vec![u], vec![this_week]);

    f.use_case.execute().await.unwrap();

    let sent = f.emails.sent();
    let (data, _) = digest_of(&sent[0]);
    assert_eq!(data.weekly_application_goal, Some(1));
    assert_eq!(data.current_week_application_count, Some(1));
    assert!(data.application_streak_weeks.is_some_and(|streak| streak >= 1));
}
