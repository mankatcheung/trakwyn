use std::sync::Arc;

use super::support::*;
use crate::domain::security_event::SecurityEventType;
use crate::domain::totp_backup_code::TotpBackupCode;
use crate::domain::user::User;
use crate::use_cases::auth::SessionAuthTime;
use crate::use_cases::clock::now;
use crate::use_cases::errors::ErrorCode;
use crate::use_cases::test_support::{
    sequential_ids, FakeQrCodeRenderer, FakeSecurityEventRepository, FakeTotpBackupCodeRepository,
    FakeTotpProvider, FakeUserRepository,
};
use crate::use_cases::user::secrets::sha256_hex;
use crate::use_cases::user::*;

const SECRET: &str = "SECRET";
const VALID_CODE: &str = "123456";
const ALREADY_ENABLED: &str = "Two-factor authentication is already enabled";

struct Fixture {
    users: Arc<FakeUserRepository>,
    codes: Arc<FakeTotpBackupCodeRepository>,
    events: Arc<FakeSecurityEventRepository>,
    totp: Arc<FakeTotpProvider>,
}

impl Fixture {
    fn new(users: Vec<User>) -> Self {
        Self::with_codes(users, vec![])
    }

    fn with_codes(users: Vec<User>, codes: Vec<TotpBackupCode>) -> Self {
        Self {
            users: Arc::new(FakeUserRepository::with(users)),
            codes: Arc::new(FakeTotpBackupCodeRepository::with(codes)),
            events: Arc::default(),
            totp: Arc::new(FakeTotpProvider::default().with_valid_code(SECRET, VALID_CODE)),
        }
    }

    fn generate(&self) -> GenerateTotpSecretUseCase {
        GenerateTotpSecretUseCase {
            user_repository: self.users.clone(),
            totp_provider: self.totp.clone(),
            qr_code_renderer: Arc::new(FakeQrCodeRenderer),
        }
    }

    fn confirm(&self) -> ConfirmTotpSetupUseCase {
        ConfirmTotpSetupUseCase {
            user_repository: self.users.clone(),
            totp_backup_code_repository: self.codes.clone(),
            totp_provider: self.totp.clone(),
            security_event_repository: self.events.clone(),
            generate_id: sequential_ids("id"),
        }
    }

    fn disable(&self) -> DisableTotpUseCase {
        DisableTotpUseCase {
            user_repository: self.users.clone(),
            totp_backup_code_repository: self.codes.clone(),
            security_event_repository: self.events.clone(),
            generate_id: sequential_ids("id"),
        }
    }

    fn regenerate(&self) -> RegenerateTotpBackupCodesUseCase {
        RegenerateTotpBackupCodesUseCase {
            user_repository: self.users.clone(),
            totp_backup_code_repository: self.codes.clone(),
            security_event_repository: self.events.clone(),
            generate_id: sequential_ids("id"),
        }
    }

    fn status(&self) -> GetTotpStatusUseCase {
        GetTotpStatusUseCase { user_repository: self.users.clone() }
    }
}

/// Enrolment started, not yet confirmed.
fn user_mid_setup() -> User {
    User { totp_secret: Some(format!("fake-encrypted:{SECRET}")), ..user() }
}

fn old_code(id: &str, user_id: &str) -> TotpBackupCode {
    TotpBackupCode {
        id: id.to_string(),
        user_id: user_id.to_string(),
        code_hash: format!("old-hash-{id}"),
        used_at: None,
        created_at: now(),
    }
}

fn device() -> (Option<String>, Option<String>) {
    (Some("203.0.113.7".to_string()), Some("Firefox".to_string()))
}

/// Ten 16-character hex codes, each stored only as its SHA-256.
fn assert_fresh_codes(raw: &[String], stored: &[TotpBackupCode]) {
    assert_eq!(raw.len(), 10);
    assert!(raw.iter().all(|code| code.len() == 16));
    let mut expected: Vec<String> = raw.iter().map(|code| sha256_hex(code)).collect();
    let mut hashes: Vec<String> = stored.iter().map(|code| code.code_hash.clone()).collect();
    expected.sort();
    hashes.sort();
    assert_eq!(hashes, expected);
    assert!(stored.iter().all(|code| code.user_id == USER && code.used_at.is_none()));
}

mod status {
    use super::*;

    #[tokio::test]
    async fn fails_when_the_user_does_not_exist() {
        let err = Fixture::new(vec![]).status().execute(USER).await.unwrap_err();
        assert_error(&err, ErrorCode::NotFound, "User not found");
    }

    #[tokio::test]
    async fn reports_whether_2fa_is_enabled() {
        assert!(Fixture::new(vec![user_with_2fa()]).status().execute(USER).await.unwrap());
        assert!(!Fixture::new(vec![user()]).status().execute(USER).await.unwrap());
        // A secret that was generated but never confirmed is not "enabled".
        assert!(!Fixture::new(vec![user_mid_setup()]).status().execute(USER).await.unwrap());
    }
}

mod generate {
    use super::*;

    fn input(password: &str) -> GenerateTotpSecretInput {
        GenerateTotpSecretInput { user_id: USER.to_string(), password: password.to_string() }
    }

    #[tokio::test]
    async fn fails_when_the_user_does_not_exist() {
        let err = Fixture::new(vec![]).generate().execute(input(PASSWORD)).await.unwrap_err();
        assert_error(&err, ErrorCode::NotFound, "User not found");
    }

    #[tokio::test]
    async fn refuses_when_2fa_is_already_enabled_before_looking_at_the_password() {
        let fixture = Fixture::new(vec![user_with_2fa()]);
        let err = fixture.generate().execute(input(WRONG_PASSWORD)).await.unwrap_err();
        assert_error(&err, ErrorCode::Conflict, ALREADY_ENABLED);
    }

    #[tokio::test]
    async fn refuses_a_wrong_password_and_stores_nothing() {
        let fixture = Fixture::new(vec![user()]);
        let err = fixture.generate().execute(input(WRONG_PASSWORD)).await.unwrap_err();
        assert_error(&err, ErrorCode::Unauthorized, "Invalid password");
        assert_eq!(stored(&fixture.users, USER).await.totp_secret, None);
    }

    #[tokio::test]
    async fn refuses_an_account_with_no_password() {
        let fixture = Fixture::new(vec![oauth_only_user()]);
        let err = fixture.generate().execute(input(PASSWORD)).await.unwrap_err();
        assert_error(&err, ErrorCode::Unauthorized, NO_PASSWORD_MESSAGE);
    }

    #[tokio::test]
    async fn stores_the_secret_encrypted_not_yet_enabled_and_returns_the_setup() {
        let fixture = Fixture::new(vec![user()]);

        let setup = fixture.generate().execute(input(PASSWORD)).await.unwrap();

        assert_eq!(setup.secret, "FAKESECRET1");
        assert_eq!(
            setup.otpauth_url,
            "otpauth://totp/Fake:user@example.com?secret=FAKESECRET1&issuer=Fake"
        );
        assert_eq!(setup.qr_code_data_url, format!("fake-qr:{}", setup.otpauth_url));

        let stored = stored(&fixture.users, USER).await;
        assert_eq!(stored.totp_secret.as_deref(), Some("fake-encrypted:FAKESECRET1"));
        assert!(!stored.totp_enabled);
    }

    #[tokio::test]
    async fn starting_again_replaces_the_unconfirmed_secret() {
        let fixture = Fixture::new(vec![user()]);
        fixture.generate().execute(input(PASSWORD)).await.unwrap();
        let second = fixture.generate().execute(input(PASSWORD)).await.unwrap();

        assert_eq!(second.secret, "FAKESECRET2");
        assert_eq!(
            stored(&fixture.users, USER).await.totp_secret.as_deref(),
            Some("fake-encrypted:FAKESECRET2")
        );
    }
}

mod confirm {
    use super::*;

    fn input(code: &str) -> ConfirmTotpSetupInput {
        let (ip_address, user_agent) = device();
        ConfirmTotpSetupInput {
            user_id: USER.to_string(),
            code: code.to_string(),
            ip_address,
            user_agent,
        }
    }

    #[tokio::test]
    async fn fails_when_the_user_does_not_exist() {
        let err = Fixture::new(vec![]).confirm().execute(input(VALID_CODE)).await.unwrap_err();
        assert_error(&err, ErrorCode::NotFound, "User not found");
    }

    #[tokio::test]
    async fn refuses_when_2fa_is_already_enabled() {
        let fixture = Fixture::new(vec![user_with_2fa()]);
        let err = fixture.confirm().execute(input(VALID_CODE)).await.unwrap_err();
        assert_error(&err, ErrorCode::Conflict, ALREADY_ENABLED);
    }

    #[tokio::test]
    async fn refuses_when_no_setup_is_in_progress() {
        let fixture = Fixture::new(vec![user()]);
        let err = fixture.confirm().execute(input(VALID_CODE)).await.unwrap_err();
        assert_error(&err, ErrorCode::Conflict, "No two-factor setup in progress");
    }

    #[tokio::test]
    async fn refuses_a_code_that_does_not_match() {
        let fixture = Fixture::new(vec![user_mid_setup()]);

        let err = fixture.confirm().execute(input("654321")).await.unwrap_err();

        assert_error(&err, ErrorCode::Unauthorized, "Invalid verification code");
        assert!(!stored(&fixture.users, USER).await.totp_enabled);
        assert!(fixture.codes.all().is_empty());
        assert!(fixture.events.all().is_empty());
    }

    #[tokio::test]
    async fn a_code_that_is_not_six_digits_is_the_providers_error_as_in_apps_api() {
        let fixture = Fixture::new(vec![user_mid_setup()]);
        let err = fixture.confirm().execute(input("abc")).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::InternalError);
        assert!(!stored(&fixture.users, USER).await.totp_enabled);
    }

    #[tokio::test]
    async fn enables_2fa_and_issues_ten_backup_codes_stored_as_hashes() {
        let fixture = Fixture::new(vec![user_mid_setup()]);

        let output = fixture.confirm().execute(input(VALID_CODE)).await.unwrap();

        assert!(stored(&fixture.users, USER).await.totp_enabled);
        assert_fresh_codes(&output.backup_codes, &fixture.codes.all());
    }

    #[tokio::test]
    async fn records_a_totp_enabled_event_with_the_callers_device() {
        let fixture = Fixture::new(vec![user_mid_setup()]);

        fixture.confirm().execute(input(VALID_CODE)).await.unwrap();

        let events = fixture.events.all();
        assert_eq!(events.len(), 1);
        // Ten ids went to the codes first.
        assert_eq!(events[0].id, "id-11");
        assert_eq!(events[0].event_type, SecurityEventType::TotpEnabled);
        assert_eq!(events[0].ip_address.as_deref(), Some("203.0.113.7"));
        assert_eq!(events[0].user_agent.as_deref(), Some("Firefox"));
    }
}

mod disable {
    use super::*;

    fn input(password: &str) -> DisableTotpInput {
        let (ip_address, user_agent) = device();
        DisableTotpInput {
            user_id: USER.to_string(),
            password: password.to_string(),
            ip_address,
            user_agent,
        }
    }

    #[tokio::test]
    async fn fails_when_the_user_does_not_exist() {
        let err = Fixture::new(vec![]).disable().execute(input(PASSWORD)).await.unwrap_err();
        assert_error(&err, ErrorCode::NotFound, "User not found");
    }

    #[tokio::test]
    async fn refuses_a_wrong_password_and_leaves_2fa_on() {
        let fixture = Fixture::with_codes(vec![user_with_2fa()], vec![old_code("c1", USER)]);

        let err = fixture.disable().execute(input(WRONG_PASSWORD)).await.unwrap_err();

        assert_error(&err, ErrorCode::Unauthorized, "Invalid password");
        assert!(stored(&fixture.users, USER).await.totp_enabled);
        assert_eq!(fixture.codes.all().len(), 1);
    }

    #[tokio::test]
    async fn refuses_an_account_with_no_password() {
        let fixture = Fixture::new(vec![oauth_only_user()]);
        let err = fixture.disable().execute(input(PASSWORD)).await.unwrap_err();
        assert_error(&err, ErrorCode::Unauthorized, NO_PASSWORD_MESSAGE);
    }

    #[tokio::test]
    async fn clears_the_secret_turns_2fa_off_and_deletes_only_this_users_codes() {
        let fixture = Fixture::with_codes(
            vec![user_with_2fa()],
            vec![old_code("c1", USER), old_code("c2", USER), old_code("c3", "someone-else")],
        );

        fixture.disable().execute(input(PASSWORD)).await.unwrap();

        let stored = stored(&fixture.users, USER).await;
        assert!(!stored.totp_enabled);
        assert_eq!(stored.totp_secret, None);
        let left: Vec<String> = fixture.codes.all().into_iter().map(|code| code.id).collect();
        assert_eq!(left, vec!["c3"]);
    }

    #[tokio::test]
    async fn records_a_totp_disabled_event_with_the_callers_device() {
        let fixture = Fixture::new(vec![user_with_2fa()]);

        fixture.disable().execute(input(PASSWORD)).await.unwrap();

        let events = fixture.events.all();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event_type, SecurityEventType::TotpDisabled);
        assert_eq!(events[0].ip_address.as_deref(), Some("203.0.113.7"));
        assert_eq!(events[0].user_agent.as_deref(), Some("Firefox"));
    }

    #[tokio::test]
    async fn needs_no_fresh_session_unlike_the_other_2fa_changes() {
        // `apps/api` asks only for the password here; there is no step-up.
        let fixture = Fixture::new(vec![user_with_2fa()]);
        fixture.disable().execute(input(PASSWORD)).await.unwrap();
        assert!(!stored(&fixture.users, USER).await.totp_enabled);
    }
}

mod regenerate {
    use super::*;

    fn input(password: &str, auth_time: SessionAuthTime) -> RegenerateTotpBackupCodesInput {
        let (ip_address, user_agent) = device();
        RegenerateTotpBackupCodesInput {
            user_id: USER.to_string(),
            current_password: password.to_string(),
            auth_time,
            ip_address,
            user_agent,
        }
    }

    #[tokio::test]
    async fn fails_when_the_user_does_not_exist() {
        let fixture = Fixture::new(vec![]);
        let err = fixture.regenerate().execute(input(PASSWORD, fresh())).await.unwrap_err();
        assert_error(&err, ErrorCode::NotFound, "User not found");
    }

    #[tokio::test]
    async fn requires_2fa_to_be_enabled() {
        let fixture = Fixture::new(vec![user()]);
        let err = fixture.regenerate().execute(input(PASSWORD, fresh())).await.unwrap_err();
        assert_error(&err, ErrorCode::Conflict, "Two-factor authentication is not enabled");
    }

    #[tokio::test]
    async fn refuses_a_wrong_password_and_keeps_the_old_codes() {
        let fixture = Fixture::with_codes(vec![user_with_2fa()], vec![old_code("c1", USER)]);

        let err = fixture.regenerate().execute(input(WRONG_PASSWORD, fresh())).await.unwrap_err();

        assert_error(&err, ErrorCode::Unauthorized, "Invalid password");
        assert_eq!(fixture.codes.all().len(), 1);
    }

    #[tokio::test]
    async fn refuses_an_account_with_no_password() {
        let fixture = Fixture::new(vec![User { password_hash: None, ..user_with_2fa() }]);
        let err = fixture.regenerate().execute(input(PASSWORD, fresh())).await.unwrap_err();
        assert_error(&err, ErrorCode::Unauthorized, NO_PASSWORD_MESSAGE);
    }

    #[tokio::test]
    async fn a_stale_or_unknown_session_must_step_up() {
        for auth_time in [stale(), SessionAuthTime::Missing] {
            let fixture = Fixture::with_codes(vec![user_with_2fa()], vec![old_code("c1", USER)]);

            let err = fixture.regenerate().execute(input(PASSWORD, auth_time)).await.unwrap_err();

            assert_error(&err, ErrorCode::StepUpRequired, STEP_UP_MESSAGE);
            assert_eq!(fixture.codes.all().len(), 1);
        }
    }

    #[tokio::test]
    async fn api_token_auth_is_treated_as_fresh() {
        let fixture = Fixture::new(vec![user_with_2fa()]);
        let output = fixture
            .regenerate()
            .execute(input(PASSWORD, SessionAuthTime::NotApplicable))
            .await
            .unwrap();
        assert_eq!(output.backup_codes.len(), 10);
    }

    #[tokio::test]
    async fn replaces_the_old_codes_with_ten_new_ones_and_records_the_event() {
        let fixture = Fixture::with_codes(
            vec![user_with_2fa()],
            vec![old_code("c1", USER), old_code("c2", "someone-else")],
        );

        let output = fixture.regenerate().execute(input(PASSWORD, fresh())).await.unwrap();

        let (mine, others): (Vec<_>, Vec<_>) =
            fixture.codes.all().into_iter().partition(|code| code.user_id == USER);
        assert_fresh_codes(&output.backup_codes, &mine);
        assert_eq!(others.len(), 1);

        let events = fixture.events.all();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event_type, SecurityEventType::TotpBackupCodesRegenerated);
        assert_eq!(events[0].ip_address.as_deref(), Some("203.0.113.7"));
    }
}
