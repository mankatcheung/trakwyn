//! Password reset: requesting it (by primary or backup email) and redeeming it.

use std::sync::Arc;

use chrono::TimeDelta;

use super::*;
use crate::domain::password_reset_token::PasswordResetToken;
use crate::domain::user::User;
use crate::use_cases::clock::now;
use crate::use_cases::errors::{DomainResult, ErrorCode};
use crate::use_cases::test_support::sequential_ids;
use crate::use_cases::test_support::{
    session_for, user_with_email, FakeEmailService, FakePasswordResetTokenRepository,
    FakeRateLimiter, FakeSessionRepository, FakeUserRepository, SentEmail,
};

const ORIGIN: &str = "https://app.example.com";
const EMAIL: &str = "Ada@Example.com";
const BACKUP_EMAIL: &str = "Backup@Example.com";
const RAW_TOKEN: &str = "raw-reset-token";

fn user() -> User {
    User {
        backup_email: Some(BACKUP_EMAIL.to_string()),
        backup_email_verified_at: Some(now()),
        ..user_with_email("user-1", EMAIL)
    }
}

fn token(expires_in: TimeDelta, used: bool) -> PasswordResetToken {
    PasswordResetToken {
        id: "token-old".to_string(),
        user_id: "user-1".to_string(),
        token_hash: hash_token(RAW_TOKEN),
        expires_at: now() + expires_in,
        used_at: used.then(now),
        created_at: now(),
    }
}

struct Fixture {
    users: Arc<FakeUserRepository>,
    tokens: Arc<FakePasswordResetTokenRepository>,
    sessions: Arc<FakeSessionRepository>,
    emails: Arc<FakeEmailService>,
    limiter: Arc<FakeRateLimiter>,
}

impl Fixture {
    fn new(users: Vec<User>, tokens: Vec<PasswordResetToken>, limiter: FakeRateLimiter) -> Self {
        Self {
            users: Arc::new(FakeUserRepository::with(users)),
            tokens: Arc::new(FakePasswordResetTokenRepository::with(tokens)),
            sessions: Arc::new(FakeSessionRepository::with(vec![
                session_for("s1", "user-1"),
                session_for("s2", "user-1"),
                session_for("foreign", "user-2"),
            ])),
            emails: Arc::default(),
            limiter: Arc::new(limiter),
        }
    }

    fn standard() -> Self {
        Self::new(vec![user()], Vec::new(), FakeRateLimiter::default())
    }

    async fn request(&self, email: &str, ip_address: Option<&str>) -> DomainResult<()> {
        RequestPasswordResetUseCase {
            user_repository: self.users.clone(),
            password_reset_token_repository: self.tokens.clone(),
            email_service: self.emails.clone(),
            password_reset_rate_limiter: self.limiter.clone(),
            generate_id: sequential_ids("token"),
            web_app_origin: ORIGIN.to_string(),
        }
        .execute(RequestPasswordResetInput {
            email: email.to_string(),
            ip_address: ip_address.map(str::to_string),
        })
        .await
    }

    async fn recover(&self, backup_email: &str, ip_address: Option<&str>) -> DomainResult<()> {
        RequestBackupEmailRecoveryUseCase {
            user_repository: self.users.clone(),
            password_reset_token_repository: self.tokens.clone(),
            email_service: self.emails.clone(),
            backup_email_recovery_rate_limiter: self.limiter.clone(),
            generate_id: sequential_ids("token"),
            web_app_origin: ORIGIN.to_string(),
        }
        .execute(RequestBackupEmailRecoveryInput {
            backup_email: backup_email.to_string(),
            ip_address: ip_address.map(str::to_string),
        })
        .await
    }

    async fn reset(&self, raw: &str, new_password: &str) -> DomainResult<()> {
        ResetPasswordUseCase {
            user_repository: self.users.clone(),
            password_reset_token_repository: self.tokens.clone(),
            session_repository: self.sessions.clone(),
        }
        .execute(ResetPasswordInput {
            token: raw.to_string(),
            new_password: new_password.to_string(),
        })
        .await
    }

    /// The recipient and raw token of the one reset mail that was sent.
    fn mailed(&self) -> (String, String) {
        match self.emails.sent().as_slice() {
            [SentEmail::PasswordReset { to, reset_url }] => (
                to.clone(),
                reset_url
                    .strip_prefix(&format!("{ORIGIN}/reset-password?token="))
                    .unwrap_or_else(|| panic!("unexpected link: {reset_url}"))
                    .to_string(),
            ),
            other => panic!("expected one reset mail, got {other:?}"),
        }
    }
}

// ── RequestPasswordResetUseCase ──

#[tokio::test]
async fn a_request_for_an_unknown_email_is_a_silent_no_op() {
    let fixture = Fixture::standard();

    fixture.request("nobody@example.com", None).await.unwrap();

    assert!(fixture.tokens.all().is_empty());
    assert!(fixture.emails.sent().is_empty());
}

#[tokio::test]
async fn a_request_replaces_older_tokens_and_mails_a_link() {
    let fixture =
        Fixture::new(vec![user()], vec![token(TimeDelta::hours(1), false)], Default::default());

    fixture.request(EMAIL, None).await.unwrap();

    let (to, raw) = fixture.mailed();
    assert_eq!(to, EMAIL);
    assert_eq!(raw.len(), 64);
    assert!(raw.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)));

    let stored = fixture.tokens.all();
    assert_eq!(stored.len(), 1);
    assert_eq!(stored[0].id, "token-1");
    assert_eq!(stored[0].user_id, "user-1");
    assert_eq!(stored[0].token_hash, hash_token(&raw));
    assert_eq!(stored[0].used_at, None);
}

#[tokio::test]
async fn the_reset_link_expires_about_an_hour_later() {
    let fixture = Fixture::standard();
    let before = now();

    fixture.request(EMAIL, None).await.unwrap();

    let expires_at = fixture.tokens.all()[0].expires_at;
    assert!(expires_at >= before + TimeDelta::hours(1));
    assert!(expires_at <= now() + TimeDelta::hours(1));
}

#[tokio::test]
async fn a_failed_mail_looks_the_same_as_an_unknown_email() {
    let fixture = Fixture::standard();
    fixture.emails.fail_with("provider down");

    fixture.request(EMAIL, None).await.unwrap();

    assert_eq!(fixture.tokens.all().len(), 1);
}

#[tokio::test]
async fn requests_are_limited_by_email_whether_or_not_the_account_exists() {
    let fixture = Fixture::new(vec![user()], Vec::new(), FakeRateLimiter::allowing(1));

    fixture.request("nobody@example.com", None).await.unwrap();
    let err = fixture.request("nobody@example.com", None).await.unwrap_err();

    assert_eq!(err.code(), ErrorCode::RateLimited);
    assert_eq!(err.to_string(), "Too many password reset requests. Try again later.");
}

#[tokio::test]
async fn requests_are_limited_by_address_as_well_as_email() {
    let fixture = Fixture::new(vec![user()], Vec::new(), FakeRateLimiter::allowing(1));

    fixture.request("a@example.com", Some("203.0.113.7")).await.unwrap();
    let err = fixture.request("b@example.com", Some("203.0.113.7")).await.unwrap_err();

    assert_eq!(err.code(), ErrorCode::RateLimited);
}

#[tokio::test]
async fn the_limiter_keys_use_the_lowercased_email_and_the_address() {
    let fixture = Fixture::standard();

    fixture.request(EMAIL, Some("203.0.113.7")).await.unwrap();
    fixture.request(EMAIL, None).await.unwrap();

    assert_eq!(
        fixture.limiter.consumed(),
        vec![
            "password-reset:email:ada@example.com",
            "password-reset:ip:203.0.113.7",
            "password-reset:email:ada@example.com",
        ]
    );
}

// ── RequestBackupEmailRecoveryUseCase ──

#[tokio::test]
async fn recovery_mails_the_link_to_the_backup_address() {
    let fixture =
        Fixture::new(vec![user()], vec![token(TimeDelta::hours(1), false)], Default::default());

    fixture.recover(BACKUP_EMAIL, Some("203.0.113.7")).await.unwrap();

    let (to, raw) = fixture.mailed();
    assert_eq!(to, BACKUP_EMAIL);
    let stored = fixture.tokens.all();
    assert_eq!(stored.len(), 1);
    assert_eq!(stored[0].token_hash, hash_token(&raw));
    assert_eq!(
        fixture.limiter.consumed(),
        vec![
            "backup-email-recovery:email:backup@example.com",
            "backup-email-recovery:ip:203.0.113.7"
        ]
    );
}

#[tokio::test]
async fn recovery_for_an_unknown_backup_email_is_a_silent_no_op() {
    let fixture = Fixture::standard();

    fixture.recover("nobody@example.com", None).await.unwrap();

    assert!(fixture.tokens.all().is_empty());
    assert!(fixture.emails.sent().is_empty());
}

#[tokio::test]
async fn recovery_ignores_an_unverified_backup_email() {
    let unverified = User { backup_email_verified_at: None, ..user() };
    let fixture = Fixture::new(vec![unverified], Vec::new(), Default::default());

    fixture.recover(BACKUP_EMAIL, None).await.unwrap();

    assert!(fixture.tokens.all().is_empty());
    assert!(fixture.emails.sent().is_empty());
}

#[tokio::test]
async fn recovery_does_not_answer_to_the_primary_email() {
    let fixture = Fixture::standard();

    fixture.recover(EMAIL, None).await.unwrap();

    assert!(fixture.emails.sent().is_empty());
}

#[tokio::test]
async fn recovery_swallows_a_failed_mail() {
    let fixture = Fixture::standard();
    fixture.emails.fail_with("provider down");

    fixture.recover(BACKUP_EMAIL, None).await.unwrap();

    assert_eq!(fixture.tokens.all().len(), 1);
}

#[tokio::test]
async fn recovery_is_rate_limited() {
    let fixture = Fixture::new(vec![user()], Vec::new(), FakeRateLimiter::allowing(0));

    let err = fixture.recover(BACKUP_EMAIL, None).await.unwrap_err();

    assert_eq!(err.code(), ErrorCode::RateLimited);
    assert_eq!(err.to_string(), "Too many backup email recovery requests. Try again later.");
}

// ── ResetPasswordUseCase ──

#[tokio::test]
async fn a_short_new_password_is_a_validation_error() {
    let fixture =
        Fixture::new(vec![user()], vec![token(TimeDelta::hours(1), false)], Default::default());

    let err = fixture.reset(RAW_TOKEN, "short").await.unwrap_err();

    assert_eq!(err.code(), ErrorCode::Validation);
    assert_eq!(fixture.tokens.all()[0].used_at, None);
}

#[tokio::test]
async fn an_unknown_reset_token_is_unauthorized() {
    let fixture = Fixture::standard();

    let err = fixture.reset(RAW_TOKEN, "long enough").await.unwrap_err();

    assert_eq!(err.code(), ErrorCode::Unauthorized);
    assert_eq!(err.to_string(), "Invalid or expired reset link");
}

#[tokio::test]
async fn a_used_reset_token_is_unauthorized() {
    let fixture =
        Fixture::new(vec![user()], vec![token(TimeDelta::hours(1), true)], Default::default());

    let err = fixture.reset(RAW_TOKEN, "long enough").await.unwrap_err();

    assert_eq!(err.to_string(), "Invalid or expired reset link");
}

#[tokio::test]
async fn an_expired_reset_token_is_unauthorized() {
    let fixture =
        Fixture::new(vec![user()], vec![token(TimeDelta::seconds(-1), false)], Default::default());

    let err = fixture.reset(RAW_TOKEN, "long enough").await.unwrap_err();

    assert_eq!(err.to_string(), "Invalid or expired reset link");
    assert_eq!(fixture.users.all()[0].password_hash.as_deref(), Some("hashed"));
}

#[tokio::test]
async fn a_valid_token_sets_the_password_spends_the_token_and_revokes_every_session() {
    let fixture =
        Fixture::new(vec![user()], vec![token(TimeDelta::hours(1), false)], Default::default());

    fixture.reset(RAW_TOKEN, "long enough").await.unwrap();

    let hash = fixture.users.all()[0].password_hash.clone().unwrap();
    assert!(hash.starts_with("$2b$12$"), "{hash}");
    assert!(verify_password("long enough", &hash).await.unwrap());
    assert!(fixture.tokens.all()[0].used_at.is_some());

    let revoked: Vec<String> = fixture
        .sessions
        .all()
        .into_iter()
        .filter(|session| session.revoked_at.is_some())
        .map(|session| session.id)
        .collect();
    assert_eq!(revoked, vec!["s1", "s2"]);
    // ...and the link cannot be replayed.
    assert!(fixture.reset(RAW_TOKEN, "another long one").await.is_err());
}

#[tokio::test]
async fn a_mailed_reset_link_redeems() {
    let fixture = Fixture::standard();
    fixture.request(EMAIL, None).await.unwrap();

    fixture.reset(&fixture.mailed().1, "long enough").await.unwrap();

    assert!(fixture.tokens.all()[0].used_at.is_some());
}
