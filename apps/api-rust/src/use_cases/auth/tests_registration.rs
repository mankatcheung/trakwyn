//! Registration and email verification.

use std::sync::Arc;

use chrono::TimeDelta;

use super::*;
use crate::domain::email_verification_token::EmailVerificationToken;
use crate::use_cases::clock::now;
use crate::use_cases::errors::ErrorCode;
use crate::use_cases::test_support::{
    sequential_ids, user_with_email, FakeEmailService, FakeEmailVerificationTokenRepository,
    FakeUserRepository, SentEmail,
};

const ORIGIN: &str = "https://app.example.com";
const RAW_TOKEN: &str = "raw-verification-token";

struct Fixture {
    users: Arc<FakeUserRepository>,
    tokens: Arc<FakeEmailVerificationTokenRepository>,
    emails: Arc<FakeEmailService>,
}

impl Fixture {
    fn new(tokens: Vec<EmailVerificationToken>) -> Self {
        Self {
            users: Arc::new(FakeUserRepository::with(vec![user_with_email(
                "user-1",
                "ada@example.com",
            )])),
            tokens: Arc::new(FakeEmailVerificationTokenRepository::with(tokens)),
            emails: Arc::default(),
        }
    }

    fn send(&self) -> SendEmailVerificationUseCase {
        SendEmailVerificationUseCase {
            user_repository: self.users.clone(),
            email_verification_token_repository: self.tokens.clone(),
            email_service: self.emails.clone(),
            generate_id: sequential_ids("token"),
            web_app_origin: ORIGIN.to_string(),
        }
    }

    fn register(&self) -> RegisterUseCase {
        RegisterUseCase {
            user_repository: self.users.clone(),
            generate_id: sequential_ids("user-new"),
            send_email_verification_use_case: self.send(),
        }
    }

    fn verify(&self) -> VerifyEmailUseCase {
        VerifyEmailUseCase {
            user_repository: self.users.clone(),
            email_verification_token_repository: self.tokens.clone(),
        }
    }

    /// The raw token in the one verification mail that was sent.
    fn mailed_token(&self) -> String {
        match self.emails.sent().as_slice() {
            [SentEmail::EmailVerification { verify_url, .. }] => verify_url
                .strip_prefix(&format!("{ORIGIN}/verify-email?token="))
                .unwrap_or_else(|| panic!("unexpected link: {verify_url}"))
                .to_string(),
            other => panic!("expected one verification mail, got {other:?}"),
        }
    }
}

fn token(expires_in: TimeDelta, used: bool) -> EmailVerificationToken {
    EmailVerificationToken {
        id: "token-old".to_string(),
        user_id: "user-1".to_string(),
        token_hash: hash_token(RAW_TOKEN),
        new_email: None,
        expires_at: now() + expires_in,
        used_at: used.then(now),
        created_at: now(),
    }
}

fn register_input(email: &str, password: &str) -> RegisterInput {
    RegisterInput { email: email.to_string(), password: password.to_string() }
}

// ── RegisterUseCase ──

#[tokio::test]
async fn registers_a_user_with_a_generated_id_and_a_bcrypt_hash() {
    let fixture = Fixture::new(Vec::new());

    let output =
        fixture.register().execute(register_input("new@example.com", "long enough")).await.unwrap();

    assert_eq!(
        output,
        RegisterOutput { user_id: "user-new-1".to_string(), email: "new@example.com".to_string() }
    );
    let user = fixture.users.all().into_iter().find(|user| user.id == "user-new-1").unwrap();
    let hash = user.password_hash.unwrap();
    assert!(hash.starts_with("$2b$12$"), "{hash}");
    assert!(verify_password("long enough", &hash).await.unwrap());
    assert_eq!(user.email_verified_at, None);
    assert_eq!(user.name, None);
}

#[tokio::test]
async fn registering_sends_a_verification_mail_to_the_new_user() {
    let fixture = Fixture::new(Vec::new());

    fixture.register().execute(register_input("new@example.com", "long enough")).await.unwrap();

    assert_eq!(fixture.emails.sent()[0].to(), "new@example.com");
    let stored = fixture.tokens.all();
    assert_eq!(stored.len(), 1);
    assert_eq!(stored[0].user_id, "user-new-1");
    assert_eq!(stored[0].token_hash, hash_token(&fixture.mailed_token()));
}

#[tokio::test]
async fn registering_a_taken_email_is_a_conflict() {
    let fixture = Fixture::new(Vec::new());

    let err = fixture
        .register()
        .execute(register_input("ada@example.com", "long enough"))
        .await
        .unwrap_err();

    assert_eq!(err.code(), ErrorCode::Conflict);
    assert_eq!(err.to_string(), "Email already registered");
    assert_eq!(fixture.users.all().len(), 1);
}

#[tokio::test]
async fn registering_with_a_short_password_is_a_validation_error() {
    let fixture = Fixture::new(Vec::new());

    let err =
        fixture.register().execute(register_input("new@example.com", "short")).await.unwrap_err();

    assert_eq!(err.code(), ErrorCode::Validation);
    assert_eq!(err.to_string(), "Password must be at least 8 characters");
    assert_eq!(fixture.users.all().len(), 1);
}

#[tokio::test]
async fn a_short_password_is_refused_before_the_email_is_looked_up() {
    let fixture = Fixture::new(Vec::new());

    // A taken email with a short password must not reveal that it is taken.
    let err =
        fixture.register().execute(register_input("ada@example.com", "short")).await.unwrap_err();

    assert_eq!(err.code(), ErrorCode::Validation);
}

#[tokio::test]
async fn registration_succeeds_when_the_verification_mail_fails() {
    let fixture = Fixture::new(Vec::new());
    fixture.emails.fail_with("provider down");

    let output =
        fixture.register().execute(register_input("new@example.com", "long enough")).await.unwrap();

    assert_eq!(output.user_id, "user-new-1");
    assert!(fixture.emails.sent().is_empty());
}

// ── SendEmailVerificationUseCase ──

#[tokio::test]
async fn sending_for_a_missing_user_is_not_found() {
    let fixture = Fixture::new(Vec::new());

    let err = fixture.send().execute("missing").await.unwrap_err();

    assert_eq!(err.code(), ErrorCode::NotFound);
    assert_eq!(err.to_string(), "User not found");
}

#[tokio::test]
async fn sending_replaces_older_tokens_and_mails_a_link() {
    let fixture = Fixture::new(vec![token(TimeDelta::hours(1), false)]);

    fixture.send().execute("user-1").await.unwrap();

    let raw = fixture.mailed_token();
    assert_eq!(raw.len(), 64);
    assert!(raw.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)));
    assert_eq!(fixture.emails.sent()[0].to(), "ada@example.com");

    let stored = fixture.tokens.all();
    assert_eq!(stored.len(), 1);
    assert_eq!(stored[0].id, "token-1");
    assert_eq!(stored[0].token_hash, hash_token(&raw));
    assert_eq!(stored[0].new_email, None);
    assert_eq!(stored[0].used_at, None);
}

#[tokio::test]
async fn the_link_expires_about_a_day_later() {
    let fixture = Fixture::new(Vec::new());
    let before = now();

    fixture.send().execute("user-1").await.unwrap();

    let expires_at = fixture.tokens.all()[0].expires_at;
    assert!(expires_at >= before + TimeDelta::hours(24));
    assert!(expires_at <= now() + TimeDelta::hours(24));
}

#[tokio::test]
async fn a_failed_mail_is_reported_to_the_caller() {
    let fixture = Fixture::new(Vec::new());
    fixture.emails.fail_with("provider down");

    assert!(fixture.send().execute("user-1").await.is_err());
}

// ── VerifyEmailUseCase ──

async fn verify(fixture: &Fixture, raw: &str) -> crate::use_cases::errors::DomainResult<()> {
    fixture.verify().execute(VerifyEmailInput { token: raw.to_string() }).await
}

#[tokio::test]
async fn an_unknown_token_is_unauthorized() {
    let fixture = Fixture::new(Vec::new());

    let err = verify(&fixture, RAW_TOKEN).await.unwrap_err();

    assert_eq!(err.code(), ErrorCode::Unauthorized);
    assert_eq!(err.to_string(), "Invalid or expired verification link");
}

#[tokio::test]
async fn a_used_token_is_unauthorized() {
    let fixture = Fixture::new(vec![token(TimeDelta::hours(1), true)]);

    let err = verify(&fixture, RAW_TOKEN).await.unwrap_err();

    assert_eq!(err.to_string(), "Invalid or expired verification link");
    assert_eq!(fixture.users.all()[0].email_verified_at, None);
}

#[tokio::test]
async fn an_expired_token_is_unauthorized() {
    let fixture = Fixture::new(vec![token(TimeDelta::seconds(-1), false)]);

    let err = verify(&fixture, RAW_TOKEN).await.unwrap_err();

    assert_eq!(err.to_string(), "Invalid or expired verification link");
}

#[tokio::test]
async fn a_valid_token_verifies_the_user_and_is_spent() {
    let fixture = Fixture::new(vec![token(TimeDelta::hours(1), false)]);

    verify(&fixture, RAW_TOKEN).await.unwrap();

    assert!(fixture.users.all()[0].email_verified_at.is_some());
    assert!(fixture.tokens.all()[0].used_at.is_some());
    // ...so it cannot be replayed.
    assert!(verify(&fixture, RAW_TOKEN).await.is_err());
}

#[tokio::test]
async fn a_mailed_link_redeems() {
    let fixture = Fixture::new(Vec::new());
    fixture.send().execute("user-1").await.unwrap();

    verify(&fixture, &fixture.mailed_token()).await.unwrap();

    assert!(fixture.users.all()[0].email_verified_at.is_some());
}
