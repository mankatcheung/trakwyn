//! Login, the TOTP second step and step-up reauthentication.

use std::sync::Arc;

use super::password_hashing::hash_password_with_cost;
use super::*;
use crate::domain::totp_backup_code::TotpBackupCode;
use crate::domain::user::User;
use crate::use_cases::clock::now;
use crate::use_cases::errors::ErrorCode;
use crate::use_cases::ports::logger::LogValue;
use crate::use_cases::ports::TotpProvider;
use crate::use_cases::test_support::{
    sequential_ids, user_with_email, FakeLogger, FakeLoginEventRepository, FakeRateLimiter,
    FakeTotpBackupCodeRepository, FakeTotpProvider, FakeUserRepository, LogLevel,
};

const EMAIL: &str = "Ada@Example.com";
const PASSWORD: &str = "correct horse";
const SECRET: &str = "JBSWY3DPEHPK3PXP";
const CODE: &str = "123456";
const BACKUP_CODE: &str = "ABCD-EFGH";

/// A cheap hash: the cost is read back from the hash, so verification is fast.
async fn hashed(password: &str) -> Option<String> {
    Some(hash_password_with_cost(password, 4).await.unwrap())
}

async fn user() -> User {
    User { password_hash: hashed(PASSWORD).await, ..user_with_email("user-1", EMAIL) }
}

async fn totp_user() -> User {
    let secret = FakeTotpProvider::default().encrypt_secret(SECRET).unwrap();
    User { totp_enabled: true, totp_secret: Some(secret), ..user().await }
}

fn backup_code(user_id: &str, used: bool) -> TotpBackupCode {
    TotpBackupCode {
        id: "backup-1".to_string(),
        user_id: user_id.to_string(),
        code_hash: hash_token(BACKUP_CODE),
        used_at: used.then(now),
        created_at: now(),
    }
}

struct Fixture {
    users: Arc<FakeUserRepository>,
    login_events: Arc<FakeLoginEventRepository>,
    backup_codes: Arc<FakeTotpBackupCodeRepository>,
    limiter: Arc<FakeRateLimiter>,
    logger: Arc<FakeLogger>,
}

impl Fixture {
    fn new(users: Vec<User>) -> Self {
        Self::with(users, Vec::new(), FakeRateLimiter::default())
    }

    fn with(users: Vec<User>, codes: Vec<TotpBackupCode>, limiter: FakeRateLimiter) -> Self {
        Self {
            users: Arc::new(FakeUserRepository::with(users)),
            login_events: Arc::default(),
            backup_codes: Arc::new(FakeTotpBackupCodeRepository::with(codes)),
            limiter: Arc::new(limiter),
            logger: Arc::default(),
        }
    }

    fn totp_provider() -> Arc<FakeTotpProvider> {
        Arc::new(FakeTotpProvider::default().with_valid_code(SECRET, CODE))
    }

    fn login(&self) -> LoginUseCase {
        LoginUseCase {
            user_repository: self.users.clone(),
            login_event_repository: self.login_events.clone(),
            generate_id: sequential_ids("login"),
            logger: self.logger.clone(),
        }
    }

    fn login_with_totp(&self) -> LoginWithTotpUseCase {
        LoginWithTotpUseCase {
            user_repository: self.users.clone(),
            totp_backup_code_repository: self.backup_codes.clone(),
            totp_rate_limiter: self.limiter.clone(),
            totp_provider: Self::totp_provider(),
            logger: self.logger.clone(),
        }
    }

    fn reauthenticate(&self) -> ReauthenticateUseCase {
        ReauthenticateUseCase {
            user_repository: self.users.clone(),
            totp_backup_code_repository: self.backup_codes.clone(),
            totp_rate_limiter: self.limiter.clone(),
            totp_provider: Self::totp_provider(),
        }
    }

    /// The one failure line a refused sign-in must leave: its event, its
    /// reason and its user id (absent unless the password was accepted).
    fn failure(&self) -> (String, String, Option<String>) {
        let lines = self.logger.lines();
        assert_eq!(lines.len(), 1, "expected one log line, got {lines:?}");
        assert_eq!(lines[0].level, LogLevel::Warn);
        assert_eq!(lines[0].message, "Authentication failed");
        let text = |name: &str| match lines[0].field(name) {
            Some(LogValue::Str(value)) => Some(value.clone()),
            _ => None,
        };
        (text("event").unwrap(), text("reason").unwrap(), text("userId"))
    }
}

fn login_input(email: &str, password: &str) -> LoginInput {
    LoginInput {
        email: email.to_string(),
        password: password.to_string(),
        ip_address: Some("203.0.113.7".to_string()),
        user_agent: Some("Firefox".to_string()),
    }
}

fn totp_input(password: &str, code: &str) -> LoginWithTotpInput {
    LoginWithTotpInput {
        email: EMAIL.to_string(),
        password: password.to_string(),
        code: code.to_string(),
        ip_address: Some("203.0.113.7".to_string()),
    }
}

fn reauth_input(password: &str, code: Option<&str>) -> ReauthenticateInput {
    ReauthenticateInput {
        user_id: "user-1".to_string(),
        password: password.to_string(),
        code: code.map(str::to_string),
    }
}

// ── LoginUseCase ──

#[tokio::test]
async fn login_returns_the_user_and_records_the_login() {
    let fixture = Fixture::new(vec![user().await]);

    let user = fixture.login().execute(login_input(EMAIL, PASSWORD)).await.unwrap();

    assert_eq!(user.id, "user-1");
    let events = fixture.login_events.all();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].id, "login-1");
    assert_eq!(events[0].user_id, "user-1");
    assert_eq!(events[0].ip_address.as_deref(), Some("203.0.113.7"));
    assert_eq!(events[0].user_agent.as_deref(), Some("Firefox"));
    assert!(fixture.logger.lines().is_empty());
}

#[tokio::test]
async fn login_records_a_login_with_no_ip_or_user_agent_when_none_is_given() {
    let fixture = Fixture::new(vec![user().await]);
    let input = LoginInput { ip_address: None, user_agent: None, ..login_input(EMAIL, PASSWORD) };

    fixture.login().execute(input).await.unwrap();

    let events = fixture.login_events.all();
    assert_eq!(events[0].ip_address, None);
    assert_eq!(events[0].user_agent, None);
}

#[tokio::test]
async fn login_with_an_unknown_email_is_user_not_found() {
    let fixture = Fixture::new(Vec::new());

    let err = fixture.login().execute(login_input(EMAIL, PASSWORD)).await.unwrap_err();

    assert_eq!(err.code(), ErrorCode::UserNotFound);
    assert_eq!(err.to_string(), "No account found with this email. Please register first.");
    assert!(fixture.login_events.all().is_empty());
    assert_eq!(
        fixture.failure(),
        ("auth.login.failed".to_string(), "invalid_credentials".to_string(), None)
    );
}

#[tokio::test]
async fn login_with_the_wrong_password_is_unauthorized_and_logs_no_user_id() {
    let fixture = Fixture::new(vec![user().await]);

    let err = fixture.login().execute(login_input(EMAIL, "wrong horse")).await.unwrap_err();

    assert_eq!(err.code(), ErrorCode::Unauthorized);
    assert_eq!(err.to_string(), "Invalid credentials");
    assert!(fixture.login_events.all().is_empty());
    // Indistinguishable in the log from an unknown email.
    assert_eq!(
        fixture.failure(),
        ("auth.login.failed".to_string(), "invalid_credentials".to_string(), None)
    );
}

#[tokio::test]
async fn login_to_an_oauth_only_account_is_unauthorized() {
    let fixture = Fixture::new(vec![User { password_hash: None, ..user().await }]);

    let err = fixture.login().execute(login_input(EMAIL, PASSWORD)).await.unwrap_err();

    assert_eq!(err.code(), ErrorCode::Unauthorized);
    assert_eq!(
        err.to_string(),
        "This account has no password set. Sign in with a linked provider instead."
    );
    assert_eq!(
        fixture.failure(),
        ("auth.login.failed".to_string(), "no_password".to_string(), None)
    );
}

#[tokio::test]
async fn login_matches_the_email_exactly() {
    let fixture = Fixture::new(vec![user().await]);

    let err = fixture.login().execute(login_input("ada@example.com", PASSWORD)).await.unwrap_err();

    assert_eq!(err.code(), ErrorCode::UserNotFound);
}

// ── LoginWithTotpUseCase ──

#[tokio::test]
async fn totp_login_returns_the_user_for_valid_credentials_and_code() {
    let fixture = Fixture::new(vec![totp_user().await]);

    let user = fixture.login_with_totp().execute(totp_input(PASSWORD, CODE)).await.unwrap();

    assert_eq!(user.id, "user-1");
    // Keyed on the lowercased email and on the caller's address.
    assert_eq!(
        fixture.limiter.consumed(),
        vec!["totp:email:ada@example.com", "totp:ip:203.0.113.7"]
    );
    assert!(fixture.logger.lines().is_empty());
}

#[tokio::test]
async fn totp_login_with_an_unknown_email_is_unauthorized() {
    let fixture = Fixture::new(Vec::new());

    let err = fixture.login_with_totp().execute(totp_input(PASSWORD, CODE)).await.unwrap_err();

    assert_eq!(err.code(), ErrorCode::Unauthorized);
    assert_eq!(err.to_string(), "Invalid credentials");
    assert_eq!(
        fixture.failure(),
        ("auth.totp.failed".to_string(), "invalid_credentials".to_string(), None)
    );
    assert!(fixture.limiter.consumed().is_empty());
}

#[tokio::test]
async fn totp_login_with_the_wrong_password_is_unauthorized() {
    let fixture = Fixture::new(vec![totp_user().await]);

    let err = fixture.login_with_totp().execute(totp_input("wrong", CODE)).await.unwrap_err();

    assert_eq!(err.to_string(), "Invalid credentials");
    assert_eq!(
        fixture.failure(),
        ("auth.totp.failed".to_string(), "invalid_credentials".to_string(), None)
    );
    // A wrong password does not spend a verification attempt.
    assert!(fixture.limiter.consumed().is_empty());
}

#[tokio::test]
async fn totp_login_to_an_oauth_only_account_is_unauthorized() {
    let fixture = Fixture::new(vec![User { password_hash: None, ..totp_user().await }]);

    let err = fixture.login_with_totp().execute(totp_input(PASSWORD, CODE)).await.unwrap_err();

    assert_eq!(err.code(), ErrorCode::Unauthorized);
    assert_eq!(
        fixture.failure(),
        ("auth.totp.failed".to_string(), "no_password".to_string(), None)
    );
}

#[tokio::test]
async fn totp_login_is_unauthorized_when_two_factor_is_not_enabled() {
    let fixture = Fixture::new(vec![user().await]);

    let err = fixture.login_with_totp().execute(totp_input(PASSWORD, CODE)).await.unwrap_err();

    assert_eq!(err.to_string(), "Invalid credentials");
    assert_eq!(
        fixture.failure(),
        ("auth.totp.failed".to_string(), "invalid_credentials".to_string(), None)
    );
}

#[tokio::test]
async fn totp_login_is_rate_limited_after_too_many_attempts() {
    let fixture = Fixture::with(vec![totp_user().await], Vec::new(), FakeRateLimiter::allowing(0));

    let err = fixture.login_with_totp().execute(totp_input(PASSWORD, CODE)).await.unwrap_err();

    assert_eq!(err.code(), ErrorCode::RateLimited);
    assert_eq!(err.to_string(), "Too many verification attempts. Please try again later.");
    // Both keys are spent even though the first already refused.
    assert_eq!(fixture.limiter.consumed().len(), 2);
    assert!(fixture.logger.lines().is_empty());
}

#[tokio::test]
async fn totp_login_without_an_address_limits_by_email_only() {
    let fixture = Fixture::new(vec![totp_user().await]);
    let input = LoginWithTotpInput { ip_address: None, ..totp_input(PASSWORD, CODE) };

    fixture.login_with_totp().execute(input).await.unwrap();

    assert_eq!(fixture.limiter.consumed(), vec!["totp:email:ada@example.com"]);
}

#[tokio::test]
async fn totp_login_with_a_wrong_code_is_unauthorized_and_names_the_user() {
    let fixture = Fixture::new(vec![totp_user().await]);

    let err = fixture.login_with_totp().execute(totp_input(PASSWORD, "000000")).await.unwrap_err();

    assert_eq!(err.code(), ErrorCode::Unauthorized);
    assert_eq!(err.to_string(), "Invalid verification code");
    assert_eq!(
        fixture.failure(),
        ("auth.totp.failed".to_string(), "invalid_code".to_string(), Some("user-1".to_string()))
    );
}

#[tokio::test]
async fn totp_login_accepts_an_unused_backup_code_and_spends_it() {
    let fixture = Fixture::with(
        vec![totp_user().await],
        vec![backup_code("user-1", false)],
        FakeRateLimiter::default(),
    );

    fixture.login_with_totp().execute(totp_input(PASSWORD, BACKUP_CODE)).await.unwrap();

    assert!(fixture.backup_codes.all()[0].used_at.is_some());
}

#[tokio::test]
async fn totp_login_refuses_a_used_backup_code() {
    let fixture = Fixture::with(
        vec![totp_user().await],
        vec![backup_code("user-1", true)],
        FakeRateLimiter::default(),
    );

    let err =
        fixture.login_with_totp().execute(totp_input(PASSWORD, BACKUP_CODE)).await.unwrap_err();

    assert_eq!(err.to_string(), "Invalid verification code");
}

#[tokio::test]
async fn totp_login_refuses_another_users_backup_code() {
    let fixture = Fixture::with(
        vec![totp_user().await],
        vec![backup_code("user-2", false)],
        FakeRateLimiter::default(),
    );

    let err =
        fixture.login_with_totp().execute(totp_input(PASSWORD, BACKUP_CODE)).await.unwrap_err();

    assert_eq!(err.to_string(), "Invalid verification code");
    assert_eq!(fixture.backup_codes.all()[0].used_at, None);
}

// ── ReauthenticateUseCase ──

#[tokio::test]
async fn reauth_for_a_missing_user_is_unauthorized() {
    let fixture = Fixture::new(Vec::new());

    let err = fixture.reauthenticate().execute(reauth_input(PASSWORD, None)).await.unwrap_err();

    assert_eq!(err.code(), ErrorCode::Unauthorized);
    assert_eq!(err.to_string(), "Invalid credentials");
}

#[tokio::test]
async fn reauth_with_the_wrong_password_is_unauthorized() {
    let fixture = Fixture::new(vec![user().await]);

    let err = fixture.reauthenticate().execute(reauth_input("wrong", None)).await.unwrap_err();

    assert_eq!(err.to_string(), "Invalid credentials");
}

#[tokio::test]
async fn reauth_for_an_oauth_only_account_is_unauthorized() {
    let fixture = Fixture::new(vec![User { password_hash: None, ..user().await }]);

    let err = fixture.reauthenticate().execute(reauth_input(PASSWORD, None)).await.unwrap_err();

    assert_eq!(
        err.to_string(),
        "This account has no password set. Sign in with a linked provider instead."
    );
}

#[tokio::test]
async fn reauth_needs_only_the_password_without_two_factor() {
    let fixture = Fixture::new(vec![user().await]);

    let output = fixture.reauthenticate().execute(reauth_input(PASSWORD, None)).await.unwrap();

    assert!(!output.totp_required);
    assert_eq!(output.user.id, "user-1");
}

#[tokio::test]
async fn reauth_asks_for_a_code_when_two_factor_is_on_and_none_was_given() {
    let fixture = Fixture::new(vec![totp_user().await]);

    let missing = fixture.reauthenticate().execute(reauth_input(PASSWORD, None)).await.unwrap();
    let empty = fixture.reauthenticate().execute(reauth_input(PASSWORD, Some(""))).await.unwrap();

    assert!(missing.totp_required);
    assert!(empty.totp_required);
    // Asking for the code is not an attempt at one.
    assert!(fixture.limiter.consumed().is_empty());
}

#[tokio::test]
async fn reauth_accepts_a_valid_code() {
    let fixture = Fixture::new(vec![totp_user().await]);

    let output =
        fixture.reauthenticate().execute(reauth_input(PASSWORD, Some(CODE))).await.unwrap();

    assert!(!output.totp_required);
    assert_eq!(fixture.limiter.consumed(), vec!["totp:stepup:user:user-1"]);
}

#[tokio::test]
async fn reauth_accepts_an_unused_backup_code_and_spends_it() {
    let fixture = Fixture::with(
        vec![totp_user().await],
        vec![backup_code("user-1", false)],
        FakeRateLimiter::default(),
    );

    let output =
        fixture.reauthenticate().execute(reauth_input(PASSWORD, Some(BACKUP_CODE))).await.unwrap();

    assert!(!output.totp_required);
    assert!(fixture.backup_codes.all()[0].used_at.is_some());
}

#[tokio::test]
async fn reauth_with_a_wrong_code_is_unauthorized() {
    let fixture = Fixture::new(vec![totp_user().await]);

    let err =
        fixture.reauthenticate().execute(reauth_input(PASSWORD, Some("000000"))).await.unwrap_err();

    assert_eq!(err.code(), ErrorCode::Unauthorized);
    assert_eq!(err.to_string(), "Invalid verification code");
}

#[tokio::test]
async fn reauth_is_rate_limited_after_too_many_attempts() {
    let fixture = Fixture::with(vec![totp_user().await], Vec::new(), FakeRateLimiter::allowing(0));

    let err =
        fixture.reauthenticate().execute(reauth_input(PASSWORD, Some(CODE))).await.unwrap_err();

    assert_eq!(err.code(), ErrorCode::RateLimited);
    assert_eq!(err.to_string(), "Too many verification attempts. Please try again later.");
}
