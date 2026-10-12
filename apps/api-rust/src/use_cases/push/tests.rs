use std::sync::Arc;

use chrono::{DateTime, TimeDelta, Utc};

use super::*;
use crate::domain::interview_round::{InterviewRound, InterviewRoundOutcome, InterviewRoundType};
use crate::domain::notification::NotificationType;
use crate::domain::push_subscription::{PushSubscription, PushSubscriptionProvider};
use crate::domain::user::User;
use crate::use_cases::clock::now;
use crate::use_cases::notifications::CreateNotificationUseCase;
use crate::use_cases::ports::web_push_service::PushPayload;
use crate::use_cases::ports::PushSubscriptionRepository;
use crate::use_cases::test_support::{
    application_owned_by, sequential_ids, user_with_email, FakeApplicationRepository,
    FakeExpoPushService, FakeInterviewRoundRepository, FakeLogger, FakeNotificationRepository,
    FakePushSubscriptionRepository, FakeUserRepository, FakeWebPushService, LogLevel,
};

const USER: &str = "user-1";

fn push_user(id: &str, enabled: bool) -> User {
    User { push_notifications_enabled: enabled, ..user_with_email(id, &format!("{id}@test.com")) }
}

fn subscription(endpoint: &str, provider: PushSubscriptionProvider) -> PushSubscription {
    let epoch = DateTime::<Utc>::UNIX_EPOCH;
    let web = provider == PushSubscriptionProvider::Web;
    PushSubscription {
        id: format!("sub-{endpoint}"),
        user_id: USER.to_string(),
        provider,
        endpoint: endpoint.to_string(),
        p256dh: web.then(|| "p256dh".to_string()),
        auth: web.then(|| "auth".to_string()),
        created_at: epoch,
        updated_at: epoch,
    }
}

fn web(endpoint: &str) -> PushSubscription {
    subscription(endpoint, PushSubscriptionProvider::Web)
}

fn expo(token: &str) -> PushSubscription {
    subscription(token, PushSubscriptionProvider::Expo)
}

fn round(id: &str, application_id: &str, scheduled_at: DateTime<Utc>) -> InterviewRound {
    InterviewRound {
        id: id.to_string(),
        application_id: application_id.to_string(),
        r#type: InterviewRoundType::Phone,
        scheduled_at: Some(scheduled_at),
        completed_at: None,
        interviewer_name: None,
        notes: None,
        outcome: InterviewRoundOutcome::Pending,
        push_notification_sent_at: None,
        created_at: DateTime::<Utc>::UNIX_EPOCH,
        updated_at: DateTime::<Utc>::UNIX_EPOCH,
    }
}

/// An application due a follow-up reminder in an hour.
fn due(id: &str, user_id: &str) -> crate::domain::application::Application {
    crate::domain::application::Application {
        follow_up_at: Some(now() + TimeDelta::hours(1)),
        ..application_owned_by(id, user_id)
    }
}

struct Fixture {
    notifications: Arc<FakeNotificationRepository>,
    subscriptions: Arc<FakePushSubscriptionRepository>,
    rounds: Arc<FakeInterviewRoundRepository>,
    web: Arc<FakeWebPushService>,
    expo: Arc<FakeExpoPushService>,
    logger: Arc<FakeLogger>,
    use_case: SendPushNotificationsUseCase,
}

#[derive(Default)]
struct Setup {
    applications: Vec<crate::domain::application::Application>,
    rounds: Vec<InterviewRound>,
    users: Vec<User>,
    subscriptions: Vec<PushSubscription>,
    web: FakeWebPushService,
    expo: FakeExpoPushService,
}

fn fixture(setup: Setup) -> Fixture {
    let notifications = Arc::new(FakeNotificationRepository::default());
    let subscriptions = Arc::new(FakePushSubscriptionRepository::with(setup.subscriptions));
    let rounds = Arc::new(FakeInterviewRoundRepository::with(setup.rounds));
    let web = Arc::new(setup.web);
    let expo = Arc::new(setup.expo);
    let logger = Arc::new(FakeLogger::default());
    let use_case = SendPushNotificationsUseCase {
        application_repository: Arc::new(FakeApplicationRepository::with(setup.applications)),
        interview_round_repository: rounds.clone(),
        user_repository: Arc::new(FakeUserRepository::with(setup.users)),
        push_subscription_repository: subscriptions.clone(),
        logger: logger.clone(),
        web_push_service: web.clone(),
        expo_push_service: expo.clone(),
        create_notification_use_case: CreateNotificationUseCase {
            notification_repository: notifications.clone(),
            generate_id: sequential_ids("n"),
        },
    };
    Fixture { notifications, subscriptions, rounds, web, expo, logger, use_case }
}

#[tokio::test]
async fn stores_an_interview_reminder_even_when_the_user_has_push_off() {
    let f = fixture(Setup {
        applications: vec![application_owned_by("app-1", USER)],
        rounds: vec![round("round-1", "app-1", now() + TimeDelta::hours(5))],
        users: vec![push_user(USER, false)],
        ..Setup::default()
    });

    let summary = f.use_case.execute().await.unwrap();

    assert_eq!(summary, PushNotificationsSummary { delivered: 0, failed: 0 });
    let stored = f.notifications.all();
    assert_eq!(stored.len(), 1);
    assert_eq!(stored[0].notification_type, NotificationType::InterviewReminder);
    assert_eq!(stored[0].title, "Upcoming interview: Acme");
    assert_eq!(stored[0].url.as_deref(), Some("/applications/app-1?section=interviews"));
    assert!(f.web.sent().is_empty());
}

#[tokio::test]
async fn words_the_interview_reminder_with_a_twelve_hour_utc_time() {
    let at = now() + TimeDelta::hours(5);
    let f = fixture(Setup {
        applications: vec![application_owned_by("app-1", USER)],
        rounds: vec![round("round-1", "app-1", at)],
        users: vec![push_user(USER, true)],
        subscriptions: vec![web("https://push/1")],
        ..Setup::default()
    });

    f.use_case.execute().await.unwrap();

    let expected_time = at.format("%-I:%M %p").to_string();
    let sent = f.web.sent();
    assert_eq!(sent.len(), 1);
    assert_eq!(
        sent[0].1,
        PushPayload {
            title: "Upcoming interview: Acme".to_string(),
            body: format!("Engineer \u{2014} phone interview tomorrow at {expected_time}"),
            url: "/applications/app-1?section=interviews".to_string(),
        }
    );
    assert!(expected_time.ends_with("AM") || expected_time.ends_with("PM"));
    assert!(!expected_time.starts_with('0'));
}

#[tokio::test]
async fn stores_a_follow_up_reminder() {
    let f = fixture(Setup {
        applications: vec![due("app-2", "user-2")],
        users: vec![push_user("user-2", false)],
        ..Setup::default()
    });

    f.use_case.execute().await.unwrap();

    let stored = f.notifications.all();
    assert_eq!(stored.len(), 1);
    assert_eq!(stored[0].user_id, "user-2");
    assert_eq!(stored[0].notification_type, NotificationType::FollowUpReminder);
    assert_eq!(stored[0].title, "Follow up: Acme");
    assert_eq!(stored[0].body, "Time to follow up on your Engineer application");
    assert_eq!(stored[0].url.as_deref(), Some("/applications/app-2?section=contacts"));
}

#[tokio::test]
async fn sends_to_every_subscription_when_push_is_on() {
    let f = fixture(Setup {
        applications: vec![due("app-2", USER)],
        users: vec![push_user(USER, true)],
        subscriptions: vec![web("https://push/1"), web("https://push/2")],
        ..Setup::default()
    });

    let summary = f.use_case.execute().await.unwrap();

    assert_eq!(summary, PushNotificationsSummary { delivered: 2, failed: 0 });
    let sent = f.web.sent();
    assert_eq!(sent[0].0.p256dh, "p256dh");
    assert_eq!(sent[0].0.auth, "auth");
    assert_eq!(sent[0].1.title, "Follow up: Acme");
}

#[tokio::test]
async fn sends_nothing_when_the_user_has_push_off() {
    let f = fixture(Setup {
        applications: vec![due("app-2", USER)],
        users: vec![push_user(USER, false)],
        subscriptions: vec![web("https://push/1")],
        ..Setup::default()
    });

    f.use_case.execute().await.unwrap();

    assert!(f.web.sent().is_empty());
}

#[tokio::test]
async fn sends_nothing_when_the_user_has_no_subscriptions_or_does_not_exist() {
    let f = fixture(Setup {
        applications: vec![due("app-2", USER), due("app-3", "ghost")],
        users: vec![push_user(USER, true)],
        ..Setup::default()
    });

    let summary = f.use_case.execute().await.unwrap();

    assert_eq!(summary, PushNotificationsSummary { delivered: 0, failed: 0 });
    // Both are still in the inbox.
    assert_eq!(f.notifications.all().len(), 2);
}

#[tokio::test]
async fn marks_the_interview_round_as_notified() {
    let f = fixture(Setup {
        applications: vec![application_owned_by("app-1", USER)],
        rounds: vec![round("round-1", "app-1", now() + TimeDelta::hours(5))],
        ..Setup::default()
    });

    f.use_case.execute().await.unwrap();

    assert!(f.rounds.all()[0].push_notification_sent_at.is_some());
}

#[tokio::test]
async fn skips_a_round_whose_application_is_gone() {
    let f = fixture(Setup {
        rounds: vec![round("round-1", "missing", now() + TimeDelta::hours(5))],
        ..Setup::default()
    });

    f.use_case.execute().await.unwrap();

    assert!(f.notifications.all().is_empty());
    assert!(f.rounds.all()[0].push_notification_sent_at.is_none());
}

#[tokio::test]
async fn removes_a_gone_web_subscription_and_counts_the_failure() {
    let f = fixture(Setup {
        applications: vec![due("app-2", USER)],
        users: vec![push_user(USER, true)],
        subscriptions: vec![web("https://push/expired"), web("https://push/ok")],
        web: FakeWebPushService::default().gone("https://push/expired"),
        ..Setup::default()
    });

    let summary = f.use_case.execute().await.unwrap();

    assert_eq!(summary, PushNotificationsSummary { delivered: 1, failed: 1 });
    let remaining: Vec<String> =
        f.subscriptions.all().into_iter().map(|subscription| subscription.endpoint).collect();
    assert_eq!(remaining, vec!["https://push/ok"]);
    let lines = f.logger.lines();
    assert_eq!(lines.len(), 1);
    assert_eq!(lines[0].level, LogLevel::Error);
    assert_eq!(lines[0].message, "Failed to send push notification");
}

#[tokio::test]
async fn keeps_a_subscription_whose_failure_was_transient() {
    let f = fixture(Setup {
        applications: vec![due("app-2", USER)],
        users: vec![push_user(USER, true)],
        subscriptions: vec![web("https://push/flaky")],
        web: FakeWebPushService::default().failing(
            "https://push/flaky",
            crate::use_cases::ports::PushDeliveryError::with_status("boom", 500),
        ),
        ..Setup::default()
    });

    let summary = f.use_case.execute().await.unwrap();

    assert_eq!(summary, PushNotificationsSummary { delivered: 0, failed: 1 });
    assert_eq!(f.subscriptions.all().len(), 1);
}

#[tokio::test]
async fn delivers_an_expo_subscription_through_the_expo_service() {
    let f = fixture(Setup {
        applications: vec![due("app-2", USER)],
        users: vec![push_user(USER, true)],
        subscriptions: vec![expo("ExponentPushToken[abc]")],
        ..Setup::default()
    });

    let summary = f.use_case.execute().await.unwrap();

    assert_eq!(summary.delivered, 1);
    assert_eq!(f.expo.sent()[0].0, "ExponentPushToken[abc]");
    assert!(f.web.sent().is_empty());
}

#[tokio::test]
async fn removes_an_expo_subscription_that_is_not_registered() {
    let f = fixture(Setup {
        applications: vec![due("app-2", USER)],
        users: vec![push_user(USER, true)],
        subscriptions: vec![expo("ExponentPushToken[dead]")],
        expo: FakeExpoPushService::default().gone("ExponentPushToken[dead]"),
        ..Setup::default()
    });

    let summary = f.use_case.execute().await.unwrap();

    assert_eq!(summary, PushNotificationsSummary { delivered: 0, failed: 1 });
    assert!(f.subscriptions.all().is_empty());
}

#[tokio::test]
async fn registers_a_web_subscription_with_its_keys() {
    let subscriptions = Arc::new(FakePushSubscriptionRepository::default());
    let use_case = RegisterPushSubscriptionUseCase {
        push_subscription_repository: subscriptions.clone(),
        generate_id: sequential_ids("sub"),
    };

    use_case
        .execute(RegisterPushSubscriptionInput {
            user_id: USER.to_string(),
            endpoint: "https://push/1".to_string(),
            p256dh: "key".to_string(),
            auth: "secret".to_string(),
        })
        .await
        .unwrap();

    let stored = subscriptions.all();
    assert_eq!(stored.len(), 1);
    assert_eq!(stored[0].id, "sub-1");
    assert_eq!(stored[0].provider, PushSubscriptionProvider::Web);
    assert_eq!(stored[0].p256dh.as_deref(), Some("key"));
    assert_eq!(stored[0].auth.as_deref(), Some("secret"));
}

#[tokio::test]
async fn registering_an_endpoint_again_moves_it_to_the_new_user() {
    let subscriptions = Arc::new(FakePushSubscriptionRepository::default());
    let use_case = RegisterPushSubscriptionUseCase {
        push_subscription_repository: subscriptions.clone(),
        generate_id: sequential_ids("sub"),
    };
    for user_id in ["user-1", "user-2"] {
        use_case
            .execute(RegisterPushSubscriptionInput {
                user_id: user_id.to_string(),
                endpoint: "https://push/1".to_string(),
                p256dh: "key".to_string(),
                auth: "secret".to_string(),
            })
            .await
            .unwrap();
    }

    let stored = subscriptions.all();
    assert_eq!(stored.len(), 1);
    assert_eq!(stored[0].user_id, "user-2");
}

#[tokio::test]
async fn registers_an_expo_token_as_a_keyless_expo_row() {
    let subscriptions = Arc::new(FakePushSubscriptionRepository::default());
    let use_case = RegisterExpoPushTokenUseCase {
        push_subscription_repository: subscriptions.clone(),
        generate_id: sequential_ids("sub"),
    };

    use_case
        .execute(RegisterExpoPushTokenInput {
            user_id: USER.to_string(),
            token: "ExponentPushToken[abc]".to_string(),
        })
        .await
        .unwrap();

    let stored = subscriptions.all();
    assert_eq!(stored[0].provider, PushSubscriptionProvider::Expo);
    assert_eq!(stored[0].endpoint, "ExponentPushToken[abc]");
    assert_eq!(stored[0].p256dh, None);
    assert_eq!(stored[0].auth, None);
}

#[tokio::test]
async fn unregisters_by_endpoint() {
    let subscriptions = Arc::new(FakePushSubscriptionRepository::with(vec![
        web("https://push/1"),
        expo("ExponentPushToken[abc]"),
    ]));
    let use_case =
        UnregisterPushSubscriptionUseCase { push_subscription_repository: subscriptions.clone() };

    use_case
        .execute(UnregisterPushSubscriptionInput { endpoint: "ExponentPushToken[abc]".into() })
        .await
        .unwrap();

    let remaining = subscriptions.find_by_endpoint("https://push/1").await.unwrap();
    assert!(remaining.is_some());
    assert_eq!(subscriptions.all().len(), 1);
}
