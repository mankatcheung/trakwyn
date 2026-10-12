//! Refresh-token rotation: the grace window and reuse detection.

use std::sync::Arc;

use chrono::TimeDelta;

use super::*;
use crate::domain::session::Session;
use crate::use_cases::clock::now;
use crate::use_cases::constants::session::ROTATION_GRACE_MS;
use crate::use_cases::errors::{DomainResult, ErrorCode};
use crate::use_cases::ids::GenerateId;
use crate::use_cases::test_support::{
    sequential_ids, session_for, FakeLogger, FakeSessionRepository, LogLevel,
};

struct Fixture {
    sessions: Arc<FakeSessionRepository>,
    logger: Arc<FakeLogger>,
    ids: GenerateId,
}

impl Fixture {
    fn new(session: Session) -> Self {
        Self {
            sessions: Arc::new(FakeSessionRepository::with(vec![session])),
            logger: Arc::default(),
            ids: sequential_ids("jti"),
        }
    }

    async fn rotate(&self, presented: Option<&str>) -> DomainResult<RotateRefreshTokenResult> {
        RotateRefreshTokenUseCase {
            session_repository: self.sessions.clone(),
            generate_id: self.ids.clone(),
            logger: self.logger.clone(),
        }
        .execute(RotateRefreshTokenInput {
            session_id: "s1".to_string(),
            presented_token_id: presented.map(str::to_string),
        })
        .await
    }

    fn stored(&self) -> Session {
        self.sessions.all().remove(0)
    }
}

/// A session whose current token is `current` and which rotated away from
/// `previous` that long ago.
fn rotated(current: &str, previous: &str, ago: TimeDelta) -> Session {
    Session {
        current_refresh_token_id: Some(current.to_string()),
        previous_refresh_token_id: Some(previous.to_string()),
        previous_rotated_at: Some(now() - ago),
        ..session_for("s1", "user-1")
    }
}

fn assert_revoked_or_expired(result: DomainResult<RotateRefreshTokenResult>) {
    let err = result.unwrap_err();
    assert_eq!(err.code(), ErrorCode::Unauthorized);
    assert_eq!(err.to_string(), "Session revoked or expired");
}

#[tokio::test]
async fn a_missing_session_is_unauthorized() {
    let fixture = Fixture::new(session_for("other", "user-1"));

    assert_revoked_or_expired(fixture.rotate(Some("refresh-s1")).await);
}

#[tokio::test]
async fn a_revoked_session_is_unauthorized() {
    let fixture = Fixture::new(Session { revoked_at: Some(now()), ..session_for("s1", "user-1") });

    assert_revoked_or_expired(fixture.rotate(Some("refresh-s1")).await);
}

#[tokio::test]
async fn an_expired_session_is_unauthorized_and_left_alone() {
    let fixture = Fixture::new(Session {
        expires_at: now() - TimeDelta::seconds(1),
        ..session_for("s1", "user-1")
    });

    assert_revoked_or_expired(fixture.rotate(Some("refresh-s1")).await);
    assert_eq!(fixture.stored().revoked_at, None);
    assert!(fixture.logger.lines().is_empty());
}

#[tokio::test]
async fn the_current_token_rotates_to_a_new_one() {
    let fixture = Fixture::new(session_for("s1", "user-1"));
    let before = now();

    let result = fixture.rotate(Some("refresh-s1")).await.unwrap();

    assert_eq!(result.new_token_id, "jti-1");
    let stored = fixture.stored();
    assert_eq!(stored.current_refresh_token_id.as_deref(), Some("jti-1"));
    assert_eq!(stored.previous_refresh_token_id.as_deref(), Some("refresh-s1"));
    assert!(stored.previous_rotated_at.unwrap() >= before);
    // The expiry slides a full lifetime forward.
    assert!(stored.expires_at >= before + TimeDelta::days(7));
    // What is returned is what was stored.
    assert_eq!(result.session.current_refresh_token_id, stored.current_refresh_token_id);
    assert_eq!(result.session.previous_refresh_token_id, stored.previous_refresh_token_id);
    assert_eq!(result.session.previous_rotated_at, stored.previous_rotated_at);
    assert_eq!(result.session.expires_at, stored.expires_at);
}

#[tokio::test]
async fn the_superseded_token_within_the_grace_window_gets_the_current_id_again() {
    let fixture = Fixture::new(rotated("current", "previous", TimeDelta::seconds(2)));
    let before = now();

    let result = fixture.rotate(Some("previous")).await.unwrap();

    // No second rotation: both tabs converge on the same id.
    assert_eq!(result.new_token_id, "current");
    let stored = fixture.stored();
    assert_eq!(stored.current_refresh_token_id.as_deref(), Some("current"));
    assert_eq!(stored.previous_refresh_token_id.as_deref(), Some("previous"));
    assert_eq!(stored.revoked_at, None);
    assert!(stored.expires_at >= before + TimeDelta::days(7));
    assert_eq!(result.session.expires_at, stored.expires_at);
}

#[tokio::test]
async fn the_superseded_token_after_the_grace_window_is_reuse() {
    let fixture = Fixture::new(rotated(
        "current",
        "previous",
        TimeDelta::milliseconds(ROTATION_GRACE_MS + 1_000),
    ));

    assert_revoked_or_expired(fixture.rotate(Some("previous")).await);
    assert!(fixture.stored().revoked_at.is_some());
}

#[tokio::test]
async fn an_unknown_token_revokes_the_session_and_is_logged() {
    let fixture = Fixture::new(rotated("current", "previous", TimeDelta::seconds(2)));

    assert_revoked_or_expired(fixture.rotate(Some("stale")).await);

    assert!(fixture.stored().revoked_at.is_some());
    let lines = fixture.logger.lines();
    assert_eq!(lines.len(), 1);
    assert_eq!(lines[0].level, LogLevel::Error);
    assert_eq!(lines[0].message, "Refresh token reuse detected for session s1 (user user-1)");
    assert!(lines[0].fields.is_empty());
}

#[tokio::test]
async fn a_token_with_no_id_against_a_tracked_session_is_reuse() {
    let fixture = Fixture::new(session_for("s1", "user-1"));

    assert_revoked_or_expired(fixture.rotate(None).await);
    assert!(fixture.stored().revoked_at.is_some());
}

#[tokio::test]
async fn a_legacy_session_adopts_the_presented_token_as_its_baseline() {
    let fixture =
        Fixture::new(Session { current_refresh_token_id: None, ..session_for("s1", "user-1") });

    let result = fixture.rotate(Some("legacy-jti")).await.unwrap();

    assert_eq!(result.new_token_id, "jti-1");
    let stored = fixture.stored();
    assert_eq!(stored.current_refresh_token_id.as_deref(), Some("jti-1"));
    assert_eq!(stored.previous_refresh_token_id.as_deref(), Some("legacy-jti"));
    assert!(stored.previous_rotated_at.is_some());
    assert_eq!(stored.revoked_at, None);
}

#[tokio::test]
async fn a_legacy_session_and_a_token_with_no_id_adopt_a_generated_placeholder() {
    let fixture =
        Fixture::new(Session { current_refresh_token_id: None, ..session_for("s1", "user-1") });

    let result = fixture.rotate(None).await.unwrap();

    let stored = fixture.stored();
    assert_eq!(stored.current_refresh_token_id.as_deref(), Some(result.new_token_id.as_str()));
    let placeholder = stored.previous_refresh_token_id.unwrap();
    assert!(placeholder.starts_with("jti-"));
    assert_ne!(placeholder, result.new_token_id);
}

#[tokio::test]
async fn a_rotated_token_cannot_be_replayed_once_the_window_has_passed() {
    let fixture = Fixture::new(session_for("s1", "user-1"));
    let first = fixture.rotate(Some("refresh-s1")).await.unwrap();

    // The new token works...
    let second = fixture.rotate(Some(&first.new_token_id)).await.unwrap();
    assert_ne!(second.new_token_id, first.new_token_id);
    // ...and the original, now two rotations old, kills the session.
    assert_revoked_or_expired(fixture.rotate(Some("refresh-s1")).await);
    assert!(fixture.stored().revoked_at.is_some());
}
