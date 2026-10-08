use std::sync::Arc;

use chrono::TimeDelta;

use super::support::*;
use crate::domain::backup_email_verification_token::BackupEmailVerificationToken;
use crate::domain::email_verification_token::EmailVerificationToken;
use crate::domain::security_event::SecurityEventType;
use crate::domain::user::User;
use crate::use_cases::auth::SessionAuthTime;
use crate::use_cases::clock::now;
use crate::use_cases::errors::ErrorCode;
use crate::use_cases::test_support::{
    sequential_ids, user_with_email, FakeBackupEmailVerificationTokenRepository, FakeEmailService,
    FakeEmailVerificationTokenRepository, FakeRateLimiter, FakeSecurityEventRepository,
    FakeUserRepository, SentEmail,
};
use crate::use_cases::user::secrets::sha256_hex;
use crate::use_cases::user::*;

const ORIGIN: &str = "https://app.example";
const NEW_EMAIL: &str = "new@example.com";
const BACKUP_EMAIL: &str = "backup@example.com";
const RAW_TOKEN: &str = "raw-token";
const INVALID_LINK: &str = "Invalid or expired confirmation link";

/// The token in a mailed link: 32 random bytes as hex.
fn token_in(url: &str, path: &str) -> String {
    let token = url.strip_prefix(&format!("{ORIGIN}{path}?token=")).unwrap().to_string();
    assert_eq!(token.len(), 64);
    assert!(token.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)));
    token
}

mod request_change {
    use super::*;

    struct Fixture {
        users: Arc<FakeUserRepository>,
        tokens: Arc<FakeEmailVerificationTokenRepository>,
        emails: Arc<FakeEmailService>,
        limiter: Arc<FakeRateLimiter>,
    }

    impl Fixture {
        fn new(users: Vec<User>) -> Self {
            Self {
                users: Arc::new(FakeUserRepository::with(users)),
                tokens: Arc::default(),
                emails: Arc::default(),
                limiter: Arc::default(),
            }
        }

        fn use_case(&self) -> RequestEmailChangeUseCase {
            RequestEmailChangeUseCase {
                user_repository: self.users.clone(),
                email_verification_token_repository: self.tokens.clone(),
                email_service: self.emails.clone(),
                request_email_change_rate_limiter: self.limiter.clone(),
                generate_id: sequential_ids("id"),
                web_app_origin: ORIGIN.to_string(),
            }
        }
    }

    fn input(password: &str, auth_time: SessionAuthTime) -> RequestEmailChangeInput {
        RequestEmailChangeInput {
            user_id: USER.to_string(),
            current_password: password.to_string(),
            new_email: NEW_EMAIL.to_string(),
            auth_time,
        }
    }

    #[tokio::test]
    async fn fails_when_the_user_does_not_exist() {
        let fixture = Fixture::new(vec![]);
        let err = fixture.use_case().execute(input(PASSWORD, fresh())).await.unwrap_err();
        assert_error(&err, ErrorCode::NotFound, "User not found");
    }

    #[tokio::test]
    async fn refuses_a_wrong_password() {
        let fixture = Fixture::new(vec![user()]);
        let err = fixture.use_case().execute(input(WRONG_PASSWORD, fresh())).await.unwrap_err();
        assert_error(&err, ErrorCode::Unauthorized, "Invalid password");
        assert!(fixture.emails.sent().is_empty());
    }

    #[tokio::test]
    async fn refuses_an_account_with_no_password() {
        let fixture = Fixture::new(vec![oauth_only_user()]);
        let err = fixture.use_case().execute(input(PASSWORD, fresh())).await.unwrap_err();
        assert_error(&err, ErrorCode::Unauthorized, NO_PASSWORD_MESSAGE);
    }

    #[tokio::test]
    async fn refuses_an_address_another_user_already_has() {
        let fixture = Fixture::new(vec![user(), user_with_email("user-2", NEW_EMAIL)]);

        let err = fixture.use_case().execute(input(PASSWORD, fresh())).await.unwrap_err();

        assert_error(&err, ErrorCode::Conflict, "Email already in use");
        assert!(fixture.tokens.all().is_empty());
    }

    #[tokio::test]
    async fn does_not_change_the_email_itself() {
        let fixture = Fixture::new(vec![user()]);
        fixture.use_case().execute(input(PASSWORD, fresh())).await.unwrap();
        assert_eq!(stored(&fixture.users, USER).await.email, EMAIL);
    }

    #[tokio::test]
    async fn replaces_pending_tokens_with_one_carrying_the_new_email() {
        let fixture = Fixture::new(vec![user()]);
        fixture.use_case().execute(input(PASSWORD, fresh())).await.unwrap();
        let before = now();
        fixture.use_case().execute(input(PASSWORD, fresh())).await.unwrap();

        let tokens = fixture.tokens.all();
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].user_id, USER);
        assert_eq!(tokens[0].new_email.as_deref(), Some(NEW_EMAIL));
        assert_eq!(tokens[0].used_at, None);
        let ttl = tokens[0].expires_at - before;
        assert!(ttl >= TimeDelta::hours(24) && ttl < TimeDelta::hours(24) + TimeDelta::seconds(5));
    }

    #[tokio::test]
    async fn mails_the_link_to_the_new_address_and_stores_only_the_tokens_hash() {
        let fixture = Fixture::new(vec![user()]);

        fixture.use_case().execute(input(PASSWORD, fresh())).await.unwrap();

        let sent = fixture.emails.sent();
        let [SentEmail::EmailVerification { to, verify_url }] = sent.as_slice() else {
            panic!("expected one verification mail, got {sent:?}");
        };
        assert_eq!(to, NEW_EMAIL);
        let raw_token = token_in(verify_url, "/confirm-email-change");
        assert_eq!(fixture.tokens.all()[0].token_hash, sha256_hex(&raw_token));
    }

    #[tokio::test]
    async fn a_failed_send_is_an_error() {
        let fixture = Fixture::new(vec![user()]);
        fixture.emails.fail_with("provider down");

        let err = fixture.use_case().execute(input(PASSWORD, fresh())).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::InternalError);
    }

    #[tokio::test]
    async fn is_rate_limited_per_user() {
        let fixture = Fixture {
            limiter: Arc::new(FakeRateLimiter::rejecting()),
            ..Fixture::new(vec![user()])
        };

        let err = fixture.use_case().execute(input(PASSWORD, fresh())).await.unwrap_err();

        assert_error(
            &err,
            ErrorCode::RateLimited,
            "Too many email change requests. Try again later.",
        );
        assert_eq!(fixture.limiter.keys(), vec!["request-email-change:user:user-1"]);
        assert!(fixture.emails.sent().is_empty());
    }

    #[tokio::test]
    async fn a_2fa_account_on_a_stale_session_must_step_up() {
        let fixture = Fixture::new(vec![user_with_2fa()]);
        let err = fixture.use_case().execute(input(PASSWORD, stale())).await.unwrap_err();
        assert_error(&err, ErrorCode::StepUpRequired, STEP_UP_MESSAGE);
        assert!(fixture.emails.sent().is_empty());
    }

    #[tokio::test]
    async fn a_2fa_account_on_a_fresh_session_succeeds() {
        let fixture = Fixture::new(vec![user_with_2fa()]);
        fixture.use_case().execute(input(PASSWORD, fresh())).await.unwrap();
        assert_eq!(fixture.emails.sent().len(), 1);
    }
}

mod confirm_change {
    use super::*;

    struct Fixture {
        users: Arc<FakeUserRepository>,
        tokens: Arc<FakeEmailVerificationTokenRepository>,
        events: Arc<FakeSecurityEventRepository>,
    }

    impl Fixture {
        fn new(users: Vec<User>, tokens: Vec<EmailVerificationToken>) -> Self {
            Self {
                users: Arc::new(FakeUserRepository::with(users)),
                tokens: Arc::new(FakeEmailVerificationTokenRepository::with(tokens)),
                events: Arc::default(),
            }
        }

        fn use_case(&self) -> ConfirmEmailChangeUseCase {
            ConfirmEmailChangeUseCase {
                user_repository: self.users.clone(),
                email_verification_token_repository: self.tokens.clone(),
                security_event_repository: self.events.clone(),
                generate_id: sequential_ids("id"),
            }
        }
    }

    fn token() -> EmailVerificationToken {
        EmailVerificationToken {
            id: "token-1".to_string(),
            user_id: USER.to_string(),
            token_hash: sha256_hex(RAW_TOKEN),
            new_email: Some(NEW_EMAIL.to_string()),
            expires_at: now() + TimeDelta::hours(1),
            used_at: None,
            created_at: now(),
        }
    }

    fn input() -> ConfirmEmailChangeInput {
        ConfirmEmailChangeInput {
            token: RAW_TOKEN.to_string(),
            ip_address: Some("203.0.113.7".to_string()),
            user_agent: Some("Firefox".to_string()),
        }
    }

    #[tokio::test]
    async fn refuses_a_token_that_matches_nothing() {
        let fixture = Fixture::new(vec![user()], vec![]);
        let err = fixture.use_case().execute(input()).await.unwrap_err();
        assert_error(&err, ErrorCode::Unauthorized, INVALID_LINK);
    }

    #[tokio::test]
    async fn refuses_a_registration_token_which_names_no_new_email() {
        let fixture =
            Fixture::new(vec![user()], vec![EmailVerificationToken { new_email: None, ..token() }]);
        let err = fixture.use_case().execute(input()).await.unwrap_err();
        assert_error(&err, ErrorCode::Unauthorized, INVALID_LINK);
    }

    #[tokio::test]
    async fn refuses_a_used_token() {
        let used = EmailVerificationToken { used_at: Some(now()), ..token() };
        let fixture = Fixture::new(vec![user()], vec![used]);
        let err = fixture.use_case().execute(input()).await.unwrap_err();
        assert_error(&err, ErrorCode::Unauthorized, INVALID_LINK);
        assert_eq!(stored(&fixture.users, USER).await.email, EMAIL);
    }

    #[tokio::test]
    async fn refuses_an_expired_token() {
        let expired =
            EmailVerificationToken { expires_at: now() - TimeDelta::seconds(1), ..token() };
        let fixture = Fixture::new(vec![user()], vec![expired]);
        let err = fixture.use_case().execute(input()).await.unwrap_err();
        assert_error(&err, ErrorCode::Unauthorized, INVALID_LINK);
    }

    #[tokio::test]
    async fn refuses_an_address_someone_took_while_the_link_sat_unused() {
        let fixture =
            Fixture::new(vec![user(), user_with_email("user-2", NEW_EMAIL)], vec![token()]);

        let err = fixture.use_case().execute(input()).await.unwrap_err();

        assert_error(&err, ErrorCode::Conflict, "Email already in use");
        assert_eq!(fixture.tokens.all()[0].used_at, None);
    }

    #[tokio::test]
    async fn applies_the_email_marks_it_verified_and_spends_the_token() {
        let fixture = Fixture::new(vec![user()], vec![token()]);
        let before = now();

        fixture.use_case().execute(input()).await.unwrap();

        let stored = stored(&fixture.users, USER).await;
        assert_eq!(stored.email, NEW_EMAIL);
        assert!(stored.email_verified_at.unwrap() >= before);
        assert!(fixture.tokens.all()[0].used_at.is_some());

        // The link works once.
        let err = fixture.use_case().execute(input()).await.unwrap_err();
        assert_error(&err, ErrorCode::Unauthorized, INVALID_LINK);
    }

    #[tokio::test]
    async fn records_an_email_changed_event_with_the_callers_device() {
        let fixture = Fixture::new(vec![user()], vec![token()]);

        fixture.use_case().execute(input()).await.unwrap();

        let events = fixture.events.all();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].user_id, USER);
        assert_eq!(events[0].event_type, SecurityEventType::EmailChanged);
        assert_eq!(events[0].ip_address.as_deref(), Some("203.0.113.7"));
        assert_eq!(events[0].user_agent.as_deref(), Some("Firefox"));
    }

    #[tokio::test]
    async fn confirming_the_address_the_owner_already_has_is_not_a_conflict() {
        let same = EmailVerificationToken { new_email: Some(EMAIL.to_string()), ..token() };
        let fixture = Fixture::new(vec![user()], vec![same]);

        fixture.use_case().execute(input()).await.unwrap();

        assert_eq!(stored(&fixture.users, USER).await.email, EMAIL);
    }
}

mod backup_email {
    use super::*;

    struct Fixture {
        users: Arc<FakeUserRepository>,
        tokens: Arc<FakeBackupEmailVerificationTokenRepository>,
        emails: Arc<FakeEmailService>,
        limiter: Arc<FakeRateLimiter>,
    }

    impl Fixture {
        fn new(users: Vec<User>, tokens: Vec<BackupEmailVerificationToken>) -> Self {
            Self {
                users: Arc::new(FakeUserRepository::with(users)),
                tokens: Arc::new(FakeBackupEmailVerificationTokenRepository::with(tokens)),
                emails: Arc::default(),
                limiter: Arc::default(),
            }
        }

        fn limited(self, limiter: FakeRateLimiter) -> Self {
            Self { limiter: Arc::new(limiter), ..self }
        }

        fn request(&self) -> RequestAddBackupEmailUseCase {
            RequestAddBackupEmailUseCase {
                user_repository: self.users.clone(),
                backup_email_verification_token_repository: self.tokens.clone(),
                email_service: self.emails.clone(),
                request_add_backup_email_rate_limiter: self.limiter.clone(),
                generate_id: sequential_ids("id"),
                web_app_origin: ORIGIN.to_string(),
            }
        }

        fn confirm(&self) -> ConfirmBackupEmailUseCase {
            ConfirmBackupEmailUseCase {
                user_repository: self.users.clone(),
                backup_email_verification_token_repository: self.tokens.clone(),
            }
        }

        fn remove(&self) -> RemoveBackupEmailUseCase {
            RemoveBackupEmailUseCase {
                user_repository: self.users.clone(),
                backup_email_verification_token_repository: self.tokens.clone(),
                remove_backup_email_rate_limiter: self.limiter.clone(),
            }
        }
    }

    fn request_input(password: &str, auth_time: SessionAuthTime) -> RequestAddBackupEmailInput {
        RequestAddBackupEmailInput {
            user_id: USER.to_string(),
            backup_email: BACKUP_EMAIL.to_string(),
            current_password: password.to_string(),
            auth_time,
        }
    }

    fn remove_input(password: &str, auth_time: SessionAuthTime) -> RemoveBackupEmailInput {
        RemoveBackupEmailInput {
            user_id: USER.to_string(),
            current_password: password.to_string(),
            auth_time,
        }
    }

    fn token() -> BackupEmailVerificationToken {
        BackupEmailVerificationToken {
            id: "token-1".to_string(),
            user_id: USER.to_string(),
            token_hash: sha256_hex(RAW_TOKEN),
            new_backup_email: BACKUP_EMAIL.to_string(),
            expires_at: now() + TimeDelta::hours(1),
            used_at: None,
            created_at: now(),
        }
    }

    fn user_with_backup() -> User {
        User {
            backup_email: Some(BACKUP_EMAIL.to_string()),
            backup_email_verified_at: Some(now()),
            ..user()
        }
    }

    const REQUEST_LIMITED: &str = "Too many backup email requests. Try again later.";

    #[tokio::test]
    async fn requesting_mails_a_link_to_the_backup_address_and_stores_the_tokens_hash() {
        let fixture = Fixture::new(vec![user()], vec![]);
        let before = now();

        fixture.request().execute(request_input(PASSWORD, fresh())).await.unwrap();

        let sent = fixture.emails.sent();
        let [SentEmail::BackupEmailVerification { to, verify_url }] = sent.as_slice() else {
            panic!("expected one backup verification mail, got {sent:?}");
        };
        assert_eq!(to, BACKUP_EMAIL);
        let raw_token = token_in(verify_url, "/confirm-backup-email");

        let tokens = fixture.tokens.all();
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].token_hash, sha256_hex(&raw_token));
        assert_eq!(tokens[0].new_backup_email, BACKUP_EMAIL);
        let ttl = tokens[0].expires_at - before;
        assert!(ttl >= TimeDelta::hours(24) && ttl < TimeDelta::hours(24) + TimeDelta::seconds(5));
        // Nothing is set until the link is clicked.
        assert_eq!(stored(&fixture.users, USER).await.backup_email, None);
        assert_eq!(
            fixture.limiter.keys(),
            vec![
                "request-add-backup-email:user:user-1",
                "request-add-backup-email:email:backup@example.com"
            ]
        );
    }

    #[tokio::test]
    async fn requesting_again_replaces_the_pending_token() {
        let fixture = Fixture::new(vec![user()], vec![token()]);
        fixture.request().execute(request_input(PASSWORD, fresh())).await.unwrap();

        let tokens = fixture.tokens.all();
        assert_eq!(tokens.len(), 1);
        assert_ne!(tokens[0].id, "token-1");
    }

    #[tokio::test]
    async fn requesting_is_rate_limited_per_user() {
        let fixture = Fixture::new(vec![user()], vec![]).limited(FakeRateLimiter::rejecting());

        let err = fixture.request().execute(request_input(PASSWORD, fresh())).await.unwrap_err();

        assert_error(&err, ErrorCode::RateLimited, REQUEST_LIMITED);
        assert_eq!(fixture.limiter.keys(), vec!["request-add-backup-email:user:user-1"]);
    }

    #[tokio::test]
    async fn requesting_is_rate_limited_per_target_address() {
        let limiter = FakeRateLimiter::default()
            .rejecting_key("request-add-backup-email:email:backup@example.com");
        let fixture = Fixture::new(vec![user()], vec![]).limited(limiter);

        let err = fixture.request().execute(request_input(PASSWORD, fresh())).await.unwrap_err();

        assert_error(&err, ErrorCode::RateLimited, REQUEST_LIMITED);
        assert!(fixture.emails.sent().is_empty());
    }

    #[tokio::test]
    async fn requesting_fails_for_a_missing_user_a_wrong_password_or_no_password() {
        let missing = Fixture::new(vec![], vec![]);
        let err = missing.request().execute(request_input(PASSWORD, fresh())).await.unwrap_err();
        assert_error(&err, ErrorCode::NotFound, "User not found");

        let wrong = Fixture::new(vec![user()], vec![]);
        let err =
            wrong.request().execute(request_input(WRONG_PASSWORD, fresh())).await.unwrap_err();
        assert_error(&err, ErrorCode::Unauthorized, "Invalid password");

        let oauth = Fixture::new(vec![oauth_only_user()], vec![]);
        let err = oauth.request().execute(request_input(PASSWORD, fresh())).await.unwrap_err();
        assert_error(&err, ErrorCode::Unauthorized, NO_PASSWORD_MESSAGE);
    }

    #[tokio::test]
    async fn requesting_on_a_stale_2fa_session_must_step_up() {
        let fixture = Fixture::new(vec![user_with_2fa()], vec![]);
        let err = fixture.request().execute(request_input(PASSWORD, stale())).await.unwrap_err();
        assert_error(&err, ErrorCode::StepUpRequired, STEP_UP_MESSAGE);
    }

    #[tokio::test]
    async fn the_backup_address_must_differ_from_the_primary_one() {
        let fixture = Fixture::new(vec![user()], vec![]);

        let err = fixture
            .request()
            .execute(RequestAddBackupEmailInput {
                backup_email: EMAIL.to_string(),
                ..request_input(PASSWORD, fresh())
            })
            .await
            .unwrap_err();

        assert_error(
            &err,
            ErrorCode::Validation,
            "Backup email must be different from your current email",
        );
    }

    #[tokio::test]
    async fn an_address_that_is_someone_elses_backup_succeeds_silently_and_sends_nothing() {
        let other = User {
            backup_email: Some(BACKUP_EMAIL.to_string()),
            ..user_with_email("user-2", "other@example.com")
        };
        let fixture = Fixture::new(vec![user(), other], vec![]);

        fixture.request().execute(request_input(PASSWORD, fresh())).await.unwrap();

        assert!(fixture.emails.sent().is_empty());
        assert!(fixture.tokens.all().is_empty());
    }

    #[tokio::test]
    async fn confirming_sets_the_backup_email_and_clears_the_users_tokens() {
        let fixture = Fixture::new(vec![user()], vec![token()]);
        let before = now();

        fixture.confirm().execute(ConfirmBackupEmailInput { token: RAW_TOKEN.to_string() }).await.unwrap();

        let stored = stored(&fixture.users, USER).await;
        assert_eq!(stored.backup_email.as_deref(), Some(BACKUP_EMAIL));
        assert!(stored.backup_email_verified_at.unwrap() >= before);
        assert!(fixture.tokens.all().is_empty());
    }

    #[tokio::test]
    async fn confirming_refuses_an_unknown_used_or_expired_token() {
        let cases = [
            vec![],
            vec![BackupEmailVerificationToken { used_at: Some(now()), ..token() }],
            vec![BackupEmailVerificationToken {
                expires_at: now() - TimeDelta::seconds(1),
                ..token()
            }],
        ];
        for tokens in cases {
            let fixture = Fixture::new(vec![user()], tokens);
            let err = fixture
                .confirm()
                .execute(ConfirmBackupEmailInput { token: RAW_TOKEN.to_string() })
                .await
                .unwrap_err();
            assert_error(&err, ErrorCode::Unauthorized, INVALID_LINK);
            assert_eq!(stored(&fixture.users, USER).await.backup_email, None);
        }
    }

    #[tokio::test]
    async fn removing_clears_the_backup_email_and_any_pending_token() {
        let fixture = Fixture::new(vec![user_with_backup()], vec![token()]);

        fixture.remove().execute(remove_input(PASSWORD, fresh())).await.unwrap();

        let stored = stored(&fixture.users, USER).await;
        assert_eq!(stored.backup_email, None);
        assert_eq!(stored.backup_email_verified_at, None);
        assert!(fixture.tokens.all().is_empty());
        assert_eq!(fixture.limiter.keys(), vec!["remove-backup-email:user:user-1"]);
    }

    #[tokio::test]
    async fn removing_is_rate_limited_per_user() {
        let fixture =
            Fixture::new(vec![user_with_backup()], vec![]).limited(FakeRateLimiter::rejecting());

        let err = fixture.remove().execute(remove_input(PASSWORD, fresh())).await.unwrap_err();

        assert_error(&err, ErrorCode::RateLimited, "Too many requests. Try again later.");
        assert!(stored(&fixture.users, USER).await.backup_email.is_some());
    }

    #[tokio::test]
    async fn removing_fails_for_a_missing_user_a_wrong_password_or_no_password() {
        let missing = Fixture::new(vec![], vec![]);
        let err = missing.remove().execute(remove_input(PASSWORD, fresh())).await.unwrap_err();
        assert_error(&err, ErrorCode::NotFound, "User not found");

        let wrong = Fixture::new(vec![user_with_backup()], vec![]);
        let err = wrong.remove().execute(remove_input(WRONG_PASSWORD, fresh())).await.unwrap_err();
        assert_error(&err, ErrorCode::Unauthorized, "Invalid password");
        assert!(stored(&wrong.users, USER).await.backup_email.is_some());

        let oauth = Fixture::new(vec![oauth_only_user()], vec![]);
        let err = oauth.remove().execute(remove_input(PASSWORD, fresh())).await.unwrap_err();
        assert_error(&err, ErrorCode::Unauthorized, NO_PASSWORD_MESSAGE);
    }

    #[tokio::test]
    async fn removing_on_a_stale_2fa_session_must_step_up() {
        let fixture = Fixture::new(
            vec![User { backup_email: Some(BACKUP_EMAIL.to_string()), ..user_with_2fa() }],
            vec![],
        );
        let err = fixture.remove().execute(remove_input(PASSWORD, stale())).await.unwrap_err();
        assert_error(&err, ErrorCode::StepUpRequired, STEP_UP_MESSAGE);
        assert!(stored(&fixture.users, USER).await.backup_email.is_some());
    }
}
