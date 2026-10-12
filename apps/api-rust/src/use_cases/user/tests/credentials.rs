use std::sync::Arc;

use super::support::*;
use crate::domain::security_event::SecurityEventType;
use crate::domain::user::User;
use crate::use_cases::auth::SessionAuthTime;
use crate::use_cases::errors::ErrorCode;
use crate::use_cases::test_support::{
    sequential_ids, FakeRateLimiter, FakeSecurityEventRepository, FakeUserRepository,
};
use crate::use_cases::user::password_hashing::verify_password;
use crate::use_cases::user::*;

const NEW_PASSWORD: &str = "a-brand-new-password";

struct Fixture {
    users: Arc<FakeUserRepository>,
    limiter: Arc<FakeRateLimiter>,
    events: Arc<FakeSecurityEventRepository>,
}

impl Fixture {
    fn new(users: Vec<User>) -> Self {
        Self::with_limiter(users, FakeRateLimiter::default())
    }

    fn with_limiter(users: Vec<User>, limiter: FakeRateLimiter) -> Self {
        Self {
            users: Arc::new(FakeUserRepository::with(users)),
            limiter: Arc::new(limiter),
            events: Arc::default(),
        }
    }

    fn use_case(&self) -> UpdatePasswordUseCase {
        UpdatePasswordUseCase {
            user_repository: self.users.clone(),
            update_password_rate_limiter: self.limiter.clone(),
            security_event_repository: self.events.clone(),
            generate_id: sequential_ids("id"),
        }
    }
}

fn input(current: &str, auth_time: SessionAuthTime) -> UpdatePasswordInput {
    UpdatePasswordInput {
        user_id: USER.to_string(),
        current_password: current.to_string(),
        new_password: NEW_PASSWORD.to_string(),
        auth_time,
        ip_address: Some("203.0.113.7".to_string()),
        user_agent: Some("Firefox".to_string()),
    }
}

#[tokio::test]
async fn stores_a_cost_12_hash_of_the_new_password() {
    let fixture = Fixture::new(vec![user()]);

    fixture.use_case().execute(input(PASSWORD, fresh())).await.unwrap();

    let hash = stored(&fixture.users, USER).await.password_hash.unwrap();
    assert!(hash.starts_with("$2b$12$"), "{hash}");
    assert!(verify_password(NEW_PASSWORD, &hash).await.unwrap());
    assert!(!verify_password(PASSWORD, &hash).await.unwrap());
    assert_eq!(fixture.limiter.keys(), vec!["update-password:user:user-1"]);
}

#[tokio::test]
async fn records_a_password_changed_event_with_the_callers_device() {
    let fixture = Fixture::new(vec![user()]);

    fixture.use_case().execute(input(PASSWORD, fresh())).await.unwrap();

    let events = fixture.events.all();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].id, "id-1");
    assert_eq!(events[0].user_id, USER);
    assert_eq!(events[0].event_type, SecurityEventType::PasswordChanged);
    assert_eq!(events[0].ip_address.as_deref(), Some("203.0.113.7"));
    assert_eq!(events[0].user_agent.as_deref(), Some("Firefox"));
}

#[tokio::test]
async fn fails_when_the_user_does_not_exist() {
    let fixture = Fixture::new(vec![]);
    let err = fixture.use_case().execute(input(PASSWORD, fresh())).await.unwrap_err();
    assert_error(&err, ErrorCode::NotFound, "User not found");
}

#[tokio::test]
async fn refuses_a_wrong_current_password_and_changes_nothing() {
    let fixture = Fixture::new(vec![user()]);

    let err = fixture.use_case().execute(input(WRONG_PASSWORD, fresh())).await.unwrap_err();

    assert_error(&err, ErrorCode::Unauthorized, "Invalid password");
    assert_eq!(stored(&fixture.users, USER).await.password_hash, Some(password_hash()));
    assert!(fixture.events.all().is_empty());
}

#[tokio::test]
async fn refuses_a_new_password_that_is_too_short_before_spending_an_attempt() {
    let fixture = Fixture::new(vec![user()]);

    let err = fixture
        .use_case()
        .execute(UpdatePasswordInput {
            new_password: "short".to_string(),
            ..input(PASSWORD, fresh())
        })
        .await
        .unwrap_err();

    assert_error(&err, ErrorCode::Validation, "Password must be at least 8 characters");
    assert!(fixture.limiter.keys().is_empty());
}

#[tokio::test]
async fn is_rate_limited_per_user_before_the_password_is_checked() {
    let fixture = Fixture::with_limiter(vec![user()], FakeRateLimiter::rejecting());

    let err = fixture.use_case().execute(input(PASSWORD, fresh())).await.unwrap_err();

    assert_error(
        &err,
        ErrorCode::RateLimited,
        "Too many password update requests. Try again later.",
    );
    assert_eq!(stored(&fixture.users, USER).await.password_hash, Some(password_hash()));
}

#[tokio::test]
async fn refuses_an_account_with_no_password() {
    let fixture = Fixture::new(vec![oauth_only_user()]);
    let err = fixture.use_case().execute(input(PASSWORD, fresh())).await.unwrap_err();
    assert_error(&err, ErrorCode::Unauthorized, NO_PASSWORD_MESSAGE);
}

mod step_up {
    use super::*;

    #[tokio::test]
    async fn a_2fa_account_on_a_stale_session_must_step_up() {
        let fixture = Fixture::new(vec![user_with_2fa()]);

        let err = fixture.use_case().execute(input(PASSWORD, stale())).await.unwrap_err();

        assert_error(&err, ErrorCode::StepUpRequired, STEP_UP_MESSAGE);
        assert_eq!(stored(&fixture.users, USER).await.password_hash, Some(password_hash()));
    }

    #[tokio::test]
    async fn a_2fa_account_whose_session_has_no_auth_time_must_step_up() {
        let fixture = Fixture::new(vec![user_with_2fa()]);
        let err = fixture
            .use_case()
            .execute(input(PASSWORD, SessionAuthTime::Missing))
            .await
            .unwrap_err();
        assert_error(&err, ErrorCode::StepUpRequired, STEP_UP_MESSAGE);
    }

    #[tokio::test]
    async fn the_password_is_checked_before_freshness() {
        let fixture = Fixture::new(vec![user_with_2fa()]);
        let err = fixture.use_case().execute(input(WRONG_PASSWORD, stale())).await.unwrap_err();
        assert_error(&err, ErrorCode::Unauthorized, "Invalid password");
    }

    #[tokio::test]
    async fn a_2fa_account_on_a_fresh_session_succeeds() {
        let fixture = Fixture::new(vec![user_with_2fa()]);
        fixture.use_case().execute(input(PASSWORD, fresh())).await.unwrap();
        assert_eq!(fixture.events.all().len(), 1);
    }

    #[tokio::test]
    async fn an_account_without_2fa_needs_no_freshness() {
        for auth_time in [stale(), SessionAuthTime::Missing] {
            let fixture = Fixture::new(vec![user()]);
            fixture.use_case().execute(input(PASSWORD, auth_time)).await.unwrap();
        }
    }

    #[tokio::test]
    async fn api_token_auth_needs_no_freshness_even_with_2fa() {
        let fixture = Fixture::new(vec![user_with_2fa()]);
        fixture.use_case().execute(input(PASSWORD, SessionAuthTime::NotApplicable)).await.unwrap();
    }
}
