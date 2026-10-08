//! What every account-management test starts from: one user with a real
//! bcrypt hash (at the lowest cost, so a test does not pay for cost 12).

use std::sync::{Arc, OnceLock};

use crate::domain::user::User;
use crate::use_cases::auth::SessionAuthTime;
use crate::use_cases::clock::now;
use crate::use_cases::constants::reauth::FRESHNESS_WINDOW_MS;
use crate::use_cases::errors::{DomainError, ErrorCode};
use crate::use_cases::ports::UserRepository;
use crate::use_cases::test_support::{user_with_email, FakeUserRepository};

pub const USER: &str = "user-1";
pub const EMAIL: &str = "user@example.com";
pub const PASSWORD: &str = "correct-password";
pub const WRONG_PASSWORD: &str = "wrong-password";
pub const STEP_UP_MESSAGE: &str = "Please verify your identity again to continue.";

const TEST_COST: u32 = 4;

pub fn password_hash() -> String {
    static HASH: OnceLock<String> = OnceLock::new();
    HASH.get_or_init(|| bcrypt::hash(PASSWORD, TEST_COST).unwrap()).clone()
}

pub fn user() -> User {
    User { password_hash: Some(password_hash()), ..user_with_email(USER, EMAIL) }
}

pub fn user_with_2fa() -> User {
    User { totp_enabled: true, totp_secret: Some("fake-encrypted:SECRET".to_string()), ..user() }
}

pub fn oauth_only_user() -> User {
    User { password_hash: None, ..user() }
}

pub fn users(users: Vec<User>) -> Arc<FakeUserRepository> {
    Arc::new(FakeUserRepository::with(users))
}

pub async fn stored(users: &FakeUserRepository, id: &str) -> User {
    users.find_by_id(id).await.unwrap().unwrap()
}

pub fn fresh() -> SessionAuthTime {
    SessionAuthTime::At(now().timestamp_millis())
}

pub fn stale() -> SessionAuthTime {
    SessionAuthTime::At(now().timestamp_millis() - FRESHNESS_WINDOW_MS - 60_000)
}

pub fn assert_error(err: &DomainError, code: ErrorCode, message: &str) {
    assert_eq!(err.code(), code);
    assert_eq!(err.to_string(), message);
}

pub const NO_PASSWORD_MESSAGE: &str =
    "This account has no password set. Sign in with a linked provider instead.";
