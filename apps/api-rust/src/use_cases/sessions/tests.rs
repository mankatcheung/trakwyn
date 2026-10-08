//! Creating, listing and revoking sessions.

use std::sync::Arc;

use chrono::TimeDelta;

use super::*;
use crate::domain::notification::NotificationType;
use crate::domain::security_event::SecurityEventType;
use crate::domain::session::Session;
use crate::use_cases::clock::now;
use crate::use_cases::errors::ErrorCode;
use crate::use_cases::notifications::CreateNotificationUseCase;
use crate::use_cases::ports::UserRepository;
use crate::use_cases::test_support::{
    sequential_ids, session_for, user_with_email, FakeDeviceLabeler, FakeEmailService,
    FakeIpLocationResolver, FakeNotificationRepository, FakeSecurityEventRepository,
    FakeSessionRepository, FakeUserRepository, SentEmail,
};

const USER: &str = "user-1";
const KNOWN_AGENT: &str = "Firefox";
const NEW_AGENT: &str = "Safari";
const IP: &str = "203.0.113.7";

struct Fixture {
    sessions: Arc<FakeSessionRepository>,
    users: Arc<FakeUserRepository>,
    notifications: Arc<FakeNotificationRepository>,
    emails: Arc<FakeEmailService>,
    security_events: Arc<FakeSecurityEventRepository>,
}

impl Fixture {
    fn new(sessions: Vec<Session>) -> Self {
        Self {
            sessions: Arc::new(FakeSessionRepository::with(sessions)),
            users: Arc::new(FakeUserRepository::with(vec![user_with_email(
                USER,
                "ada@example.com",
            )])),
            notifications: Arc::default(),
            emails: Arc::default(),
            security_events: Arc::default(),
        }
    }

    /// A user who has signed in before, from [`KNOWN_AGENT`].
    fn returning() -> Self {
        Self::new(vec![Session {
            user_agent: Some(KNOWN_AGENT.to_string()),
            ..session_for("earlier", USER)
        }])
    }

    fn create(&self) -> CreateSessionUseCase {
        CreateSessionUseCase {
            session_repository: self.sessions.clone(),
            user_repository: self.users.clone(),
            device_labeler: Arc::new(FakeDeviceLabeler),
            ip_location_resolver: Arc::new(
                FakeIpLocationResolver::default().with_location(IP, "London, United Kingdom"),
            ),
            email_service: self.emails.clone(),
            create_notification_use_case: CreateNotificationUseCase {
                notification_repository: self.notifications.clone(),
                generate_id: sequential_ids("notification"),
            },
            generate_id: sequential_ids("id"),
        }
    }

    fn revoke(&self) -> RevokeSessionUseCase {
        RevokeSessionUseCase {
            session_repository: self.sessions.clone(),
            security_event_repository: self.security_events.clone(),
            generate_id: sequential_ids("event"),
        }
    }

    fn revoke_others(&self) -> RevokeOtherSessionsUseCase {
        RevokeOtherSessionsUseCase {
            session_repository: self.sessions.clone(),
            security_event_repository: self.security_events.clone(),
            generate_id: sequential_ids("event"),
        }
    }

    fn revoked_ids(&self) -> Vec<String> {
        self.sessions
            .all()
            .into_iter()
            .filter(|session| session.revoked_at.is_some())
            .map(|session| session.id)
            .collect()
    }
}

fn input(user_agent: Option<&str>, ip_address: Option<&str>) -> CreateSessionInput {
    CreateSessionInput {
        user_id: USER.to_string(),
        user_agent: user_agent.map(str::to_string),
        ip_address: ip_address.map(str::to_string),
    }
}

// ── CreateSessionUseCase ──

#[tokio::test]
async fn creates_a_session_with_generated_ids_and_the_device_details() {
    let fixture = Fixture::new(Vec::new());

    let session = fixture.create().execute(input(Some(NEW_AGENT), Some(IP))).await.unwrap();

    assert_eq!(session.id, "id-1");
    assert_eq!(session.current_refresh_token_id.as_deref(), Some("id-2"));
    assert_eq!(session.user_id, USER);
    assert_eq!(session.user_agent.as_deref(), Some(NEW_AGENT));
    assert_eq!(session.ip_address.as_deref(), Some(IP));
    assert_eq!(session.device_label.as_deref(), Some("Device(Safari)"));
    assert_eq!(session.location.as_deref(), Some("London, United Kingdom"));
    assert_eq!(session.revoked_at, None);
    assert_eq!(fixture.sessions.all(), vec![session]);
}

#[tokio::test]
async fn a_session_without_device_details_is_still_labelled() {
    let fixture = Fixture::new(Vec::new());

    let session = fixture.create().execute(input(None, None)).await.unwrap();

    assert_eq!(session.user_agent, None);
    assert_eq!(session.ip_address, None);
    assert_eq!(session.device_label.as_deref(), Some("Unknown device"));
    assert_eq!(session.location, None);
}

#[tokio::test]
async fn a_session_expires_a_week_out() {
    let fixture = Fixture::new(Vec::new());
    let before = now();

    let session = fixture.create().execute(input(None, None)).await.unwrap();

    assert!(session.expires_at >= before + TimeDelta::days(7));
    assert!(session.expires_at <= now() + TimeDelta::days(7));
}

#[tokio::test]
async fn a_new_device_gets_a_notification_and_an_alert_mail() {
    let fixture = Fixture::returning();

    fixture.create().execute(input(Some(NEW_AGENT), None)).await.unwrap();

    let notifications = fixture.notifications.all();
    assert_eq!(notifications.len(), 1);
    assert_eq!(notifications[0].user_id, USER);
    assert_eq!(notifications[0].notification_type, NotificationType::SecurityAlert);
    assert_eq!(notifications[0].title, "New sign-in detected");
    assert_eq!(notifications[0].body, "Device(Safari) signed in");
    assert_eq!(notifications[0].url.as_deref(), Some("/settings/security#security-activity"));

    match fixture.emails.sent().as_slice() {
        [SentEmail::NewDeviceLoginAlert { to, device_label, location, ip_address, .. }] => {
            assert_eq!(to, "ada@example.com");
            assert_eq!(device_label, "Device(Safari)");
            assert_eq!(location, &None);
            assert_eq!(ip_address, &None);
        }
        other => panic!("expected one alert mail, got {other:?}"),
    }
}

#[tokio::test]
async fn the_notification_names_the_location_when_it_is_known() {
    let fixture = Fixture::returning();

    fixture.create().execute(input(Some(NEW_AGENT), Some(IP))).await.unwrap();

    assert_eq!(
        fixture.notifications.all()[0].body,
        "Device(Safari) signed in from London, United Kingdom"
    );
    match fixture.emails.sent().as_slice() {
        [SentEmail::NewDeviceLoginAlert { location, ip_address, .. }] => {
            assert_eq!(location.as_deref(), Some("London, United Kingdom"));
            assert_eq!(ip_address.as_deref(), Some(IP));
        }
        other => panic!("expected one alert mail, got {other:?}"),
    }
}

#[tokio::test]
async fn the_notification_survives_a_failed_alert_mail() {
    let fixture = Fixture::returning();
    fixture.emails.fail_with("provider down");

    let session = fixture.create().execute(input(Some(NEW_AGENT), None)).await.unwrap();

    assert_eq!(session.user_agent.as_deref(), Some(NEW_AGENT));
    assert_eq!(fixture.notifications.all().len(), 1);
}

#[tokio::test]
async fn the_very_first_session_raises_no_alert() {
    let fixture = Fixture::new(Vec::new());

    fixture.create().execute(input(Some(NEW_AGENT), None)).await.unwrap();

    assert!(fixture.notifications.all().is_empty());
    assert!(fixture.emails.sent().is_empty());
}

#[tokio::test]
async fn a_known_device_raises_no_alert() {
    let fixture = Fixture::returning();

    fixture.create().execute(input(Some(KNOWN_AGENT), None)).await.unwrap();

    assert!(fixture.notifications.all().is_empty());
    assert!(fixture.emails.sent().is_empty());
}

#[tokio::test]
async fn a_session_with_no_user_agent_raises_no_alert() {
    let fixture = Fixture::returning();

    let create = fixture.create();

    create.execute(input(None, None)).await.unwrap();
    create.execute(input(Some(""), None)).await.unwrap();

    assert!(fixture.notifications.all().is_empty());
}

#[tokio::test]
async fn a_missing_user_raises_no_alert_and_does_not_fail_the_session() {
    let fixture = Fixture::returning();
    fixture.users.delete(USER).await.unwrap();

    fixture.create().execute(input(Some(NEW_AGENT), None)).await.unwrap();

    assert!(fixture.notifications.all().is_empty());
}

// ── ListSessionsUseCase ──

#[tokio::test]
async fn lists_the_users_active_sessions() {
    let fixture = Fixture::new(vec![
        session_for("mine", USER),
        Session { revoked_at: Some(now()), ..session_for("revoked", USER) },
        session_for("foreign", "user-2"),
    ]);

    let sessions =
        ListSessionsUseCase { session_repository: fixture.sessions.clone() }.execute(USER).await;

    let ids: Vec<String> = sessions.unwrap().into_iter().map(|session| session.id).collect();
    assert_eq!(ids, vec!["mine"]);
}

// ── RevokeSessionUseCase ──

fn revoke_input(session_id: &str) -> RevokeSessionInput {
    RevokeSessionInput {
        session_id: session_id.to_string(),
        user_id: USER.to_string(),
        ip_address: Some(IP.to_string()),
        user_agent: Some(KNOWN_AGENT.to_string()),
    }
}

#[tokio::test]
async fn revoking_someone_elses_session_is_not_found() {
    let fixture = Fixture::new(vec![session_for("foreign", "user-2")]);

    let err = fixture.revoke().execute(revoke_input("foreign")).await.unwrap_err();

    assert_eq!(err.code(), ErrorCode::NotFound);
    assert_eq!(err.to_string(), "Session not found");
    assert!(fixture.revoked_ids().is_empty());
    assert!(fixture.security_events.all().is_empty());
}

#[tokio::test]
async fn revokes_the_users_own_session_and_records_it() {
    let fixture = Fixture::new(vec![session_for("s1", USER), session_for("s2", USER)]);

    fixture.revoke().execute(revoke_input("s1")).await.unwrap();

    assert_eq!(fixture.revoked_ids(), vec!["s1"]);
    let events = fixture.security_events.all();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].id, "event-1");
    assert_eq!(events[0].user_id, USER);
    assert_eq!(events[0].event_type, SecurityEventType::SessionRevoked);
    assert_eq!(events[0].ip_address.as_deref(), Some(IP));
    assert_eq!(events[0].user_agent.as_deref(), Some(KNOWN_AGENT));
}

// ── RevokeOtherSessionsUseCase ──

#[tokio::test]
async fn revokes_every_session_but_the_current_one_and_records_it() {
    let fixture = Fixture::new(vec![
        session_for("current", USER),
        session_for("other-1", USER),
        session_for("other-2", USER),
        session_for("foreign", "user-2"),
    ]);

    fixture
        .revoke_others()
        .execute(RevokeOtherSessionsInput {
            user_id: USER.to_string(),
            current_session_id: "current".to_string(),
            ip_address: None,
            user_agent: Some(KNOWN_AGENT.to_string()),
        })
        .await
        .unwrap();

    assert_eq!(fixture.revoked_ids(), vec!["other-1", "other-2"]);
    let events = fixture.security_events.all();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].event_type, SecurityEventType::OtherSessionsRevoked);
    assert_eq!(events[0].ip_address, None);
    assert_eq!(events[0].user_agent.as_deref(), Some(KNOWN_AGENT));
}
