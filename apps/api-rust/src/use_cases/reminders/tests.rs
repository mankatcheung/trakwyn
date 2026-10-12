use std::sync::Arc;

use chrono::TimeDelta;

use super::*;
use crate::domain::application::Application;
use crate::domain::user::User;
use crate::use_cases::clock::now;
use crate::use_cases::test_support::{
    application_owned_by, user_with_email, FakeApplicationRepository, FakeEmailService,
    FakeUserRepository, SentEmail,
};

fn due(id: &str, user_id: &str) -> Application {
    Application {
        follow_up_at: Some(now() + TimeDelta::hours(2)),
        ..application_owned_by(id, user_id)
    }
}

fn fixture(
    users: Vec<User>,
    applications: Vec<Application>,
) -> (Arc<FakeApplicationRepository>, Arc<FakeEmailService>, SendFollowUpRemindersUseCase) {
    let applications = Arc::new(FakeApplicationRepository::with(applications));
    let emails = Arc::new(FakeEmailService::default());
    let use_case = SendFollowUpRemindersUseCase {
        application_repository: applications.clone(),
        user_repository: Arc::new(FakeUserRepository::with(users)),
        email_service: emails.clone(),
    };
    (applications, emails, use_case)
}

#[tokio::test]
async fn emails_each_due_application_and_marks_it_sent() {
    let (applications, emails, use_case) =
        fixture(vec![user_with_email("u1", "u1@test.com")], vec![due("a1", "u1")]);

    let summary = use_case.execute().await.unwrap();

    assert_eq!(summary, FollowUpRemindersSummary { sent: 1, failed: 0, skipped: 0 });
    let follow_up_at = applications.all()[0].follow_up_at.unwrap();
    assert_eq!(
        emails.sent(),
        vec![SentEmail::FollowUpReminder {
            to: "u1@test.com".to_string(),
            company: "Acme".to_string(),
            role: "Engineer".to_string(),
            follow_up_at,
        }]
    );
    assert!(applications.all()[0].reminder_sent_at.is_some());
}

#[tokio::test]
async fn skips_an_owner_who_turned_reminders_off() {
    let off = User { follow_up_reminders_enabled: false, ..user_with_email("u1", "u1@test.com") };
    let (applications, emails, use_case) = fixture(vec![off], vec![due("a1", "u1")]);

    let summary = use_case.execute().await.unwrap();

    assert_eq!(summary, FollowUpRemindersSummary { sent: 0, failed: 0, skipped: 1 });
    assert!(emails.sent().is_empty());
    assert!(applications.all()[0].reminder_sent_at.is_none());
}

#[tokio::test]
async fn skips_an_application_whose_owner_is_gone() {
    let (_, emails, use_case) = fixture(vec![], vec![due("a1", "ghost")]);

    let summary = use_case.execute().await.unwrap();

    assert_eq!(summary, FollowUpRemindersSummary { sent: 0, failed: 0, skipped: 1 });
    assert!(emails.sent().is_empty());
}

#[tokio::test]
async fn counts_a_failed_email_and_leaves_the_reminder_unsent() {
    let (applications, emails, use_case) =
        fixture(vec![user_with_email("u1", "u1@test.com")], vec![due("a1", "u1")]);
    emails.fail_with("Brevo down");

    let summary = use_case.execute().await.unwrap();

    assert_eq!(summary, FollowUpRemindersSummary { sent: 0, failed: 1, skipped: 0 });
    assert!(applications.all()[0].reminder_sent_at.is_none());
}

#[tokio::test]
async fn does_nothing_when_nothing_is_due() {
    let (_, _, use_case) =
        fixture(vec![user_with_email("u1", "u1@test.com")], vec![application_owned_by("a1", "u1")]);

    let summary = use_case.execute().await.unwrap();

    assert_eq!(summary, FollowUpRemindersSummary { sent: 0, failed: 0, skipped: 0 });
}
