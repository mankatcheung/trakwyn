//! Credentials, email changes, account deletion and data export/import,
//! through the real GraphQL endpoint and a real database.

use chrono::{DateTime, TimeDelta, Utc};
use serde_json::{json, Value};

use trakwyn_api::infrastructure::db::Db;
use trakwyn_api::use_cases::clock::now;

use crate::account_support::*;
use crate::common::{seed_application, Auth, TestApp};

const UPDATE_PASSWORD: &str = "mutation($current: String!, $new: String!) {
    updatePassword(currentPassword: $current, newPassword: $new)
}";
const DELETE_ACCOUNT: &str = "mutation($password: String!) { deleteAccount(password: $password) }";
const REQUEST_EMAIL_CHANGE: &str = "mutation($password: String!, $email: String!) {
    requestEmailChange(currentPassword: $password, newEmail: $email)
}";
const CONFIRM_EMAIL_CHANGE: &str =
    "mutation($token: String!) { confirmEmailChange(token: $token) }";
const REQUEST_BACKUP: &str = "mutation($password: String!, $email: String!) {
    requestAddBackupEmail(currentPassword: $password, backupEmail: $email)
}";
const CONFIRM_BACKUP: &str = "mutation($token: String!) { confirmBackupEmail(token: $token) }";
const REMOVE_BACKUP: &str =
    "mutation($password: String!) { removeBackupEmail(currentPassword: $password) }";
const EXPORT: &str = "{ exportUserData }";
const IMPORT: &str = "mutation($data: String!) {
    importUserData(data: $data) {
        applicationsImported applicationsSkipped notesImported documentsSkipped
    }
}";

const NEW_PASSWORD: &str = "a-brand-new-password";
const INVALID_LINK: &str = "Invalid or expired confirmation link";
/// `JSON.stringify(data, null, 2)` of the object `apps/api`'s
/// `ExportUserDataUseCase` builds for the rows `seed_export_fixture` inserts,
/// produced by Node itself.
const NODE_EXPORT: &str = include_str!("fixtures/export_from_apps_api.json");

async fn app_with_user() -> (TestApp, String) {
    let app = TestApp::start().await;
    seed_account(&app.db, "ada").await;
    let token = fresh_token(&app, "ada");
    (app, token)
}

fn timestamp(text: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(text).unwrap().with_timezone(&Utc)
}

async fn count(db: &Db, table: &str, column: &str, value: &str) -> i64 {
    sqlx::query_scalar(&format!(r#"SELECT count(*) FROM "{table}" WHERE "{column}" = $1"#))
        .bind(value)
        .fetch_one(db.pool())
        .await
        .unwrap()
}

mod password {
    use super::*;

    fn variables(current: &str) -> Value {
        json!({ "current": current, "new": NEW_PASSWORD })
    }

    #[tokio::test]
    async fn stores_a_cost_12_bcrypt_hash_and_records_the_event_without_touching_cookies() {
        let (app, token) = app_with_user().await;

        let response =
            graphql_from_device(&app, UPDATE_PASSWORD, variables(PASSWORD), Some(&token)).await;

        assert_eq!(response.data("updatePassword"), &Value::Bool(true));
        // The session carries on: `apps/api` neither re-issues nor clears cookies here.
        assert!(set_cookies(&response).is_empty());

        let hash = user_column(&app.db, "ada", "passwordHash").await.unwrap();
        assert!(hash.starts_with("$2b$12$") && hash.len() == 60, "{hash}");
        assert!(bcrypt::verify(NEW_PASSWORD, &hash).unwrap());
        assert!(!bcrypt::verify(PASSWORD, &hash).unwrap());
        assert_eq!(
            security_events(&app.db, "ada").await,
            vec![(
                "password_changed".to_string(),
                Some(CLIENT_IP.to_string()),
                Some(USER_AGENT_VALUE.to_string())
            )]
        );
    }

    #[tokio::test]
    async fn accepts_a_current_password_hashed_by_apps_api() {
        let app = TestApp::start().await;
        seed_account_with_hash(&app.db, "node", Some(NODE_PASSWORD_HASH)).await;
        let token = fresh_token(&app, "node");

        let wrong = app.graphql(UPDATE_PASSWORD, variables(PASSWORD), Auth::Bearer(&token)).await;
        assert_eq!(wrong.error_code(), "UNAUTHORIZED");

        let right =
            app.graphql(UPDATE_PASSWORD, variables(NODE_PASSWORD), Auth::Bearer(&token)).await;
        assert_eq!(right.data("updatePassword"), &Value::Bool(true));
    }

    #[tokio::test]
    async fn refuses_a_wrong_password_a_short_one_and_an_account_without_one() {
        let (app, token) = app_with_user().await;

        let wrong =
            app.graphql(UPDATE_PASSWORD, variables(WRONG_PASSWORD), Auth::Bearer(&token)).await;
        assert_eq!(wrong.error_code(), "UNAUTHORIZED");
        assert_eq!(wrong.error_message(), "Invalid password");
        assert_eq!(status_code(&wrong), 401);

        let short = app
            .graphql(
                UPDATE_PASSWORD,
                json!({ "current": PASSWORD, "new": "short" }),
                Auth::Bearer(&token),
            )
            .await;
        assert_eq!(short.error_code(), "VALIDATION");
        assert_eq!(short.error_message(), "Password must be at least 8 characters");

        seed_account_with_hash(&app.db, "oauth", None).await;
        let oauth = fresh_token(&app, "oauth");
        let none = app.graphql(UPDATE_PASSWORD, variables(PASSWORD), Auth::Bearer(&oauth)).await;
        assert_eq!(none.error_code(), "UNAUTHORIZED");
        assert_eq!(
            none.error_message(),
            "This account has no password set. Sign in with a linked provider instead."
        );

        assert_eq!(user_column(&app.db, "ada", "passwordHash").await, Some(password_hash()));
        assert!(security_events(&app.db, "ada").await.is_empty());
    }

    #[tokio::test]
    async fn a_2fa_account_must_step_up_on_a_stale_session_but_not_on_a_fresh_one() {
        let (app, fresh) = app_with_user().await;
        enable_2fa(&app.db, "ada").await;

        let stale = stale_token(&app, "ada");
        let refused = app.graphql(UPDATE_PASSWORD, variables(PASSWORD), Auth::Bearer(&stale)).await;
        assert_eq!(refused.error_code(), "STEP_UP_REQUIRED");
        assert_eq!(refused.error_message(), STEP_UP_MESSAGE);
        assert_eq!(status_code(&refused), 403);
        assert_eq!(user_column(&app.db, "ada", "passwordHash").await, Some(password_hash()));

        let allowed = app.graphql(UPDATE_PASSWORD, variables(PASSWORD), Auth::Bearer(&fresh)).await;
        assert_eq!(allowed.data("updatePassword"), &Value::Bool(true));
    }

    #[tokio::test]
    async fn the_sixth_attempt_in_the_window_is_rate_limited() {
        let (app, token) = app_with_user().await;

        for _ in 0..5 {
            let wrong =
                app.graphql(UPDATE_PASSWORD, variables(WRONG_PASSWORD), Auth::Bearer(&token)).await;
            assert_eq!(wrong.error_code(), "UNAUTHORIZED");
        }
        // Even the right password is refused once the attempts are spent.
        let limited = app.graphql(UPDATE_PASSWORD, variables(PASSWORD), Auth::Bearer(&token)).await;

        assert_eq!(limited.error_code(), "RATE_LIMITED");
        assert_eq!(limited.error_message(), "Too many password update requests. Try again later.");
        assert_eq!(status_code(&limited), 429);
    }

    #[tokio::test]
    async fn an_anonymous_caller_is_unauthorized() {
        let (app, _token) = app_with_user().await;
        let response = app.graphql(UPDATE_PASSWORD, variables(PASSWORD), Auth::None).await;
        assert_eq!(response.error_code(), "UNAUTHORIZED");
        assert_eq!(response.error_message(), "Unauthorized");
    }
}

mod email {
    use super::*;

    async fn seed_change_token(db: &Db, raw: &str, new_email: Option<&str>, expires_in_s: i64) {
        sqlx::query(
            r#"INSERT INTO "EmailVerificationToken"
                 ("id", "userId", "tokenHash", "newEmail", "expiresAt", "createdAt")
               VALUES ($1, 'ada', $2, $3, $4, $5)"#,
        )
        .bind(format!("token-{raw}"))
        .bind(sha256_hex(raw))
        .bind(new_email)
        .bind(now() + TimeDelta::seconds(expires_in_s))
        .bind(now())
        .execute(db.pool())
        .await
        .unwrap();
    }

    async fn seed_backup_token(db: &Db, raw: &str, expires_in_s: i64) {
        sqlx::query(
            r#"INSERT INTO "BackupEmailVerificationToken"
                 ("id", "userId", "tokenHash", "newBackupEmail", "expiresAt", "createdAt")
               VALUES ($1, 'ada', $2, 'backup@example.com', $3, $4)"#,
        )
        .bind(format!("token-{raw}"))
        .bind(sha256_hex(raw))
        .bind(now() + TimeDelta::seconds(expires_in_s))
        .bind(now())
        .execute(db.pool())
        .await
        .unwrap();
    }

    /// A stored token hash is the SHA-256 of 32 random bytes in hex: 64 hex characters.
    fn is_sha256_hex(value: &str) -> bool {
        value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit())
    }

    #[tokio::test]
    async fn requesting_a_change_stores_a_one_day_token_and_leaves_the_email_alone() {
        let (app, token) = app_with_user().await;
        let variables = json!({ "password": PASSWORD, "email": "new@example.com" });

        app.graphql(REQUEST_EMAIL_CHANGE, variables.clone(), Auth::Bearer(&token)).await;
        let before = now();
        let response = app.graphql(REQUEST_EMAIL_CHANGE, variables, Auth::Bearer(&token)).await;
        assert_eq!(response.data("requestEmailChange"), &Value::Bool(true));

        // The second request replaced the first one's token.
        let rows: Vec<(String, Option<String>, DateTime<Utc>, Option<DateTime<Utc>>)> =
            sqlx::query_as(
                r#"SELECT "tokenHash", "newEmail", "expiresAt", "usedAt"
               FROM "EmailVerificationToken" WHERE "userId" = 'ada'"#,
            )
            .fetch_all(app.db.pool())
            .await
            .unwrap();
        assert_eq!(rows.len(), 1);
        let (hash, new_email, expires_at, used_at) = &rows[0];
        assert!(is_sha256_hex(hash), "{hash}");
        assert_eq!(new_email.as_deref(), Some("new@example.com"));
        assert_eq!(*used_at, None);
        let ttl = *expires_at - before;
        assert!(ttl >= TimeDelta::hours(24) && ttl < TimeDelta::hours(24) + TimeDelta::seconds(30));
        assert_eq!(user_column(&app.db, "ada", "email").await.as_deref(), Some("ada@example.com"));
    }

    #[tokio::test]
    async fn requesting_a_change_refuses_a_taken_address_a_wrong_password_and_a_stale_2fa_session()
    {
        let (app, token) = app_with_user().await;
        seed_account(&app.db, "bob").await;

        let taken = app
            .graphql(
                REQUEST_EMAIL_CHANGE,
                json!({ "password": PASSWORD, "email": "bob@example.com" }),
                Auth::Bearer(&token),
            )
            .await;
        assert_eq!(taken.error_code(), "CONFLICT");
        assert_eq!(taken.error_message(), "Email already in use");
        assert_eq!(status_code(&taken), 409);

        let wrong = app
            .graphql(
                REQUEST_EMAIL_CHANGE,
                json!({ "password": WRONG_PASSWORD, "email": "new@example.com" }),
                Auth::Bearer(&token),
            )
            .await;
        assert_eq!(wrong.error_code(), "UNAUTHORIZED");
        assert_eq!(wrong.error_message(), "Invalid password");

        enable_2fa(&app.db, "ada").await;
        let stale = stale_token(&app, "ada");
        let refused = app
            .graphql(
                REQUEST_EMAIL_CHANGE,
                json!({ "password": PASSWORD, "email": "new@example.com" }),
                Auth::Bearer(&stale),
            )
            .await;
        assert_eq!(refused.error_code(), "STEP_UP_REQUIRED");
        assert_eq!(refused.error_message(), STEP_UP_MESSAGE);

        assert_eq!(count(&app.db, "EmailVerificationToken", "userId", "ada").await, 0);
    }

    #[tokio::test]
    async fn the_fourth_change_request_in_an_hour_is_rate_limited() {
        let (app, token) = app_with_user().await;
        let variables = json!({ "password": WRONG_PASSWORD, "email": "new@example.com" });

        for _ in 0..3 {
            app.graphql(REQUEST_EMAIL_CHANGE, variables.clone(), Auth::Bearer(&token)).await;
        }
        let limited = app.graphql(REQUEST_EMAIL_CHANGE, variables, Auth::Bearer(&token)).await;

        assert_eq!(limited.error_code(), "RATE_LIMITED");
        assert_eq!(limited.error_message(), "Too many email change requests. Try again later.");
    }

    #[tokio::test]
    async fn confirming_needs_no_session_and_applies_the_change_once() {
        let (app, _token) = app_with_user().await;
        seed_change_token(&app.db, "raw-token", Some("new@example.com"), 3600).await;

        let response =
            graphql_from_device(&app, CONFIRM_EMAIL_CHANGE, json!({ "token": "raw-token" }), None)
                .await;

        assert_eq!(response.data("confirmEmailChange"), &Value::Bool(true));
        assert!(set_cookies(&response).is_empty());
        assert_eq!(user_column(&app.db, "ada", "email").await.as_deref(), Some("new@example.com"));
        assert!(user_column(&app.db, "ada", "emailVerifiedAt").await.is_some());
        assert_eq!(
            security_events(&app.db, "ada").await,
            vec![(
                "email_changed".to_string(),
                Some(CLIENT_IP.to_string()),
                Some(USER_AGENT_VALUE.to_string())
            )]
        );

        let again =
            app.graphql(CONFIRM_EMAIL_CHANGE, json!({ "token": "raw-token" }), Auth::None).await;
        assert_eq!(again.error_code(), "UNAUTHORIZED");
        assert_eq!(again.error_message(), INVALID_LINK);
        assert_eq!(status_code(&again), 401);
    }

    #[tokio::test]
    async fn confirming_refuses_unknown_expired_and_registration_tokens_and_a_taken_address() {
        let (app, _token) = app_with_user().await;
        seed_account(&app.db, "bob").await;
        seed_change_token(&app.db, "expired", Some("new@example.com"), -1).await;
        seed_change_token(&app.db, "registration", None, 3600).await;
        seed_change_token(&app.db, "taken", Some("bob@example.com"), 3600).await;

        for token in ["unknown", "expired", "registration"] {
            let response =
                app.graphql(CONFIRM_EMAIL_CHANGE, json!({ "token": token }), Auth::None).await;
            assert_eq!(response.error_code(), "UNAUTHORIZED", "{token}");
            assert_eq!(response.error_message(), INVALID_LINK, "{token}");
        }

        let taken =
            app.graphql(CONFIRM_EMAIL_CHANGE, json!({ "token": "taken" }), Auth::None).await;
        assert_eq!(taken.error_code(), "CONFLICT");
        assert_eq!(taken.error_message(), "Email already in use");

        assert_eq!(user_column(&app.db, "ada", "email").await.as_deref(), Some("ada@example.com"));
    }

    #[tokio::test]
    async fn a_backup_email_is_requested_confirmed_and_removed() {
        let (app, token) = app_with_user().await;

        let requested = app
            .graphql(
                REQUEST_BACKUP,
                json!({ "password": PASSWORD, "email": "backup@example.com" }),
                Auth::Bearer(&token),
            )
            .await;
        assert_eq!(requested.data("requestAddBackupEmail"), &Value::Bool(true));
        let (hash, pending): (String, String) = sqlx::query_as(
            r#"SELECT "tokenHash", "newBackupEmail" FROM "BackupEmailVerificationToken"
               WHERE "userId" = 'ada'"#,
        )
        .fetch_one(app.db.pool())
        .await
        .unwrap();
        assert!(is_sha256_hex(&hash), "{hash}");
        assert_eq!(pending, "backup@example.com");
        assert_eq!(user_column(&app.db, "ada", "backupEmail").await, None);

        // The mailed token is not readable from here, so confirm with one
        // stored the same way.
        seed_backup_token(&app.db, "raw-token", 3600).await;
        let confirmed =
            app.graphql(CONFIRM_BACKUP, json!({ "token": "raw-token" }), Auth::None).await;
        assert_eq!(confirmed.data("confirmBackupEmail"), &Value::Bool(true));
        assert_eq!(
            user_column(&app.db, "ada", "backupEmail").await.as_deref(),
            Some("backup@example.com")
        );
        assert!(user_column(&app.db, "ada", "backupEmailVerifiedAt").await.is_some());
        // Every pending token of the user goes, not only the one used.
        assert_eq!(count(&app.db, "BackupEmailVerificationToken", "userId", "ada").await, 0);

        let wrong = app
            .graphql(REMOVE_BACKUP, json!({ "password": WRONG_PASSWORD }), Auth::Bearer(&token))
            .await;
        assert_eq!(wrong.error_code(), "UNAUTHORIZED");

        let removed =
            app.graphql(REMOVE_BACKUP, json!({ "password": PASSWORD }), Auth::Bearer(&token)).await;
        assert_eq!(removed.data("removeBackupEmail"), &Value::Bool(true));
        assert_eq!(user_column(&app.db, "ada", "backupEmail").await, None);
        assert_eq!(user_column(&app.db, "ada", "backupEmailVerifiedAt").await, None);
    }

    #[tokio::test]
    async fn a_backup_email_must_differ_from_the_primary_and_its_link_expires() {
        let (app, token) = app_with_user().await;

        let same = app
            .graphql(
                REQUEST_BACKUP,
                json!({ "password": PASSWORD, "email": "ada@example.com" }),
                Auth::Bearer(&token),
            )
            .await;
        assert_eq!(same.error_code(), "VALIDATION");
        assert_eq!(same.error_message(), "Backup email must be different from your current email");

        seed_backup_token(&app.db, "expired", -1).await;
        for raw in ["expired", "unknown"] {
            let response = app.graphql(CONFIRM_BACKUP, json!({ "token": raw }), Auth::None).await;
            assert_eq!(response.error_code(), "UNAUTHORIZED");
            assert_eq!(response.error_message(), INVALID_LINK);
        }
        assert_eq!(user_column(&app.db, "ada", "backupEmail").await, None);
    }

    #[tokio::test]
    async fn an_address_that_is_someone_elses_backup_answers_true_and_stores_nothing() {
        let (app, token) = app_with_user().await;
        seed_account(&app.db, "bob").await;
        sqlx::query(r#"UPDATE "User" SET "backupEmail" = 'shared@example.com' WHERE "id" = 'bob'"#)
            .execute(app.db.pool())
            .await
            .unwrap();

        let response = app
            .graphql(
                REQUEST_BACKUP,
                json!({ "password": PASSWORD, "email": "shared@example.com" }),
                Auth::Bearer(&token),
            )
            .await;

        assert_eq!(response.data("requestAddBackupEmail"), &Value::Bool(true));
        assert_eq!(count(&app.db, "BackupEmailVerificationToken", "userId", "ada").await, 0);
    }

    #[tokio::test]
    async fn backup_email_requests_and_removals_are_rate_limited_with_their_own_messages() {
        let (app, token) = app_with_user().await;
        let request = json!({ "password": WRONG_PASSWORD, "email": "backup@example.com" });
        let remove = json!({ "password": WRONG_PASSWORD });

        for _ in 0..3 {
            app.graphql(REQUEST_BACKUP, request.clone(), Auth::Bearer(&token)).await;
            app.graphql(REMOVE_BACKUP, remove.clone(), Auth::Bearer(&token)).await;
        }

        let limited = app.graphql(REQUEST_BACKUP, request, Auth::Bearer(&token)).await;
        assert_eq!(limited.error_code(), "RATE_LIMITED");
        assert_eq!(limited.error_message(), "Too many backup email requests. Try again later.");

        let limited = app.graphql(REMOVE_BACKUP, remove, Auth::Bearer(&token)).await;
        assert_eq!(limited.error_code(), "RATE_LIMITED");
        assert_eq!(limited.error_message(), "Too many requests. Try again later.");
    }
}

mod deletion {
    use super::*;

    async fn seed_document(db: &Db, id: &str, application_id: &str, storage_key: &str) {
        sqlx::query(
            r#"INSERT INTO "Document"
                 ("id", "applicationId", "name", "mimeType", "sizeBytes", "storageKey",
                  "documentType", "createdAt")
               VALUES ($1, $2, 'cv.pdf', 'application/pdf', 3, $3, 'resume', $4)"#,
        )
        .bind(id)
        .bind(application_id)
        .bind(storage_key)
        .bind(now())
        .execute(db.pool())
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn deletes_the_files_then_the_row_and_its_cascade_and_clears_the_auth_cookies() {
        let (app, token) = app_with_user().await;
        seed_application(&app.db, "app-1", "ada").await;
        seed_account(&app.db, "bob").await;
        seed_application(&app.db, "app-2", "bob").await;
        // Unique keys: the local provider writes under the working directory.
        let mine = format!("test-delete-account/{}/mine.pdf", nanoid::nanoid!());
        let theirs = format!("test-delete-account/{}/theirs.pdf", nanoid::nanoid!());
        seed_document(&app.db, "doc-1", "app-1", &mine).await;
        seed_document(&app.db, "doc-2", "app-2", &theirs).await;
        let storage = &app.container.services.storage_provider;
        storage.put_object(&mine, b"pdf", "application/pdf").await.unwrap();
        storage.put_object(&theirs, b"pdf", "application/pdf").await.unwrap();
        let local = app.container.services.local_storage.clone().unwrap();

        let response = app
            .graphql(DELETE_ACCOUNT, json!({ "password": PASSWORD }), Auth::Bearer(&token))
            .await;

        assert_eq!(response.data("deleteAccount"), &Value::Bool(true));
        assert_eq!(
            set_cookies(&response),
            vec![
                "trakwyn_access_token=; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
                "trakwyn_refresh_token=; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
                "trakwyn_logged_in=; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
            ]
        );

        assert!(!user_exists(&app.db, "ada").await);
        assert_eq!(count(&app.db, "JobApplication", "userId", "ada").await, 0);
        assert_eq!(count(&app.db, "Document", "id", "doc-1").await, 0);
        assert!(local.open_object(&mine).await.unwrap().is_none());

        // Nobody else's account, rows or files are touched.
        assert!(user_exists(&app.db, "bob").await);
        assert_eq!(count(&app.db, "Document", "id", "doc-2").await, 1);
        assert!(local.open_object(&theirs).await.unwrap().is_some());
        storage.delete(&theirs).await.unwrap();
    }

    #[tokio::test]
    async fn a_wrong_password_deletes_nothing_and_sets_no_cookie() {
        let (app, token) = app_with_user().await;

        let response = app
            .graphql(DELETE_ACCOUNT, json!({ "password": WRONG_PASSWORD }), Auth::Bearer(&token))
            .await;

        assert_eq!(response.error_code(), "UNAUTHORIZED");
        assert_eq!(response.error_message(), "Invalid password");
        assert!(set_cookies(&response).is_empty());
        assert!(user_exists(&app.db, "ada").await);
    }

    #[tokio::test]
    async fn a_2fa_account_on_a_stale_session_must_step_up_first() {
        let (app, fresh) = app_with_user().await;
        enable_2fa(&app.db, "ada").await;
        let stale = stale_token(&app, "ada");

        let refused = app
            .graphql(DELETE_ACCOUNT, json!({ "password": PASSWORD }), Auth::Bearer(&stale))
            .await;
        assert_eq!(refused.error_code(), "STEP_UP_REQUIRED");
        assert_eq!(refused.error_message(), STEP_UP_MESSAGE);
        assert_eq!(status_code(&refused), 403);
        assert!(set_cookies(&refused).is_empty());
        assert!(user_exists(&app.db, "ada").await);

        let allowed = app
            .graphql(DELETE_ACCOUNT, json!({ "password": PASSWORD }), Auth::Bearer(&fresh))
            .await;
        assert_eq!(allowed.data("deleteAccount"), &Value::Bool(true));
        assert!(!user_exists(&app.db, "ada").await);
    }

    #[tokio::test]
    async fn an_account_with_no_password_cannot_be_deleted_this_way() {
        let app = TestApp::start().await;
        seed_account_with_hash(&app.db, "oauth", None).await;
        let token = fresh_token(&app, "oauth");

        let response = app
            .graphql(DELETE_ACCOUNT, json!({ "password": PASSWORD }), Auth::Bearer(&token))
            .await;

        assert_eq!(response.error_code(), "UNAUTHORIZED");
        assert!(user_exists(&app.db, "oauth").await);
    }
}

mod data {
    use super::*;

    /// The rows behind `fixtures/export_from_apps_api.json`.
    async fn seed_export_fixture(db: &Db) {
        sqlx::query(r#"UPDATE "User" SET "createdAt" = $1 WHERE "id" = 'ada'"#)
            .bind(timestamp("2025-01-02T03:04:05.006Z"))
            .execute(db.pool())
            .await
            .unwrap();
        sqlx::query(
            r#"INSERT INTO "JobApplication"
                 ("id", "userId", "company", "role", "status", "jobUrl", "location",
                  "salaryRange", "description", "appliedAt", "createdAt", "updatedAt")
               VALUES ('acme', 'ada', 'Acme', 'Engineer', 'interviewing',
                       'https://acme.example/jobs/1', 'Remote', '100-120k', $1, $2, $3, $3),
                      ('globex', 'ada', 'Globex', 'Designer', 'draft',
                       NULL, NULL, NULL, NULL, NULL, $4, $4)"#,
        )
        .bind("Line one\nSays \"hi\" \\ — ünïcode ✓ \t tab")
        .bind(timestamp("2025-03-02T08:30:00.000Z"))
        .bind(timestamp("2025-03-01T10:00:00.000Z"))
        .bind(timestamp("2025-02-01T00:00:00.000Z"))
        .execute(db.pool())
        .await
        .unwrap();
        // A trashed application is not part of an export.
        sqlx::query(
            r#"INSERT INTO "JobApplication"
                 ("id", "userId", "company", "role", "deletedAt", "createdAt", "updatedAt")
               VALUES ('trashed', 'ada', 'Trashed', 'Nobody', $1, $1, $1)"#,
        )
        .bind(timestamp("2025-04-01T00:00:00.000Z"))
        .execute(db.pool())
        .await
        .unwrap();
        for (id, content, created_at) in [
            ("n1", "Called the recruiter", "2025-03-03T09:00:00.000Z"),
            ("n2", "Second call", "2025-03-04T09:00:00.000Z"),
        ] {
            sqlx::query(
                r#"INSERT INTO "Note" ("id", "applicationId", "content", "createdAt", "updatedAt")
                   VALUES ($1, 'acme', $2, $3, $3)"#,
            )
            .bind(id)
            .bind(content)
            .bind(timestamp(created_at))
            .execute(db.pool())
            .await
            .unwrap();
        }
        sqlx::query(
            r#"INSERT INTO "Document"
                 ("id", "applicationId", "name", "mimeType", "sizeBytes", "storageKey",
                  "documentType", "createdAt")
               VALUES ('d1', 'acme', 'cv.pdf', 'application/pdf', 2048, 'users/ada/cv.pdf',
                       'resume', $1)"#,
        )
        .bind(timestamp("2025-03-05T12:00:00.123Z"))
        .execute(db.pool())
        .await
        .unwrap();
    }

    async fn export(app: &TestApp, token: &str) -> String {
        let response = app.graphql(EXPORT, json!({}), Auth::Bearer(token)).await;
        response.data("exportUserData").as_str().unwrap().to_string()
    }

    /// The document with its `exportedAt` line swapped for the fixture's: the
    /// one value that depends on when the export ran.
    fn with_fixture_export_time(document: &str) -> String {
        document
            .lines()
            .map(|line| {
                if line.starts_with("  \"exportedAt\": ") {
                    "  \"exportedAt\": \"2025-06-01T00:00:00.000Z\","
                } else {
                    line
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
    }

    #[tokio::test]
    async fn the_export_is_byte_for_byte_what_apps_api_produces() {
        let (app, token) = app_with_user().await;
        seed_export_fixture(&app.db).await;
        let before = now();

        let document = export(&app, &token).await;

        assert_eq!(with_fixture_export_time(&document), NODE_EXPORT);
        let parsed: Value = serde_json::from_str(&document).unwrap();
        let exported_at = timestamp(parsed["exportedAt"].as_str().unwrap());
        assert!(exported_at >= before && exported_at <= now());
        assert_eq!(parsed["exportedAt"].as_str().unwrap().len(), 24);
    }

    #[tokio::test]
    async fn an_empty_account_exports_an_empty_applications_array() {
        let (app, token) = app_with_user().await;

        let document = export(&app, &token).await;

        assert!(document.ends_with("  \"applications\": []\n}"), "{document}");
    }

    #[tokio::test]
    async fn an_export_from_apps_api_imports_here_and_round_trips() {
        let (app, token) = app_with_user().await;

        let imported =
            app.graphql(IMPORT, json!({ "data": NODE_EXPORT }), Auth::Bearer(&token)).await;

        assert_eq!(
            imported.data("importUserData"),
            &json!({
                "applicationsImported": 2,
                "applicationsSkipped": 0,
                "notesImported": 2,
                "documentsSkipped": 1,
            })
        );

        let original: Value = serde_json::from_str(NODE_EXPORT).unwrap();
        let mut round_trip: Value = serde_json::from_str(&export(&app, &token).await).unwrap();
        // Entries are created in file order, so listing newest-first reverses
        // them; creation times and the documents (metadata only) are not restored.
        let applications = round_trip["applications"].as_array_mut().unwrap();
        applications.sort_by_key(|application| application["company"].as_str().map(String::from));
        assert_eq!(applications.len(), 2);
        for (restored, source) in
            applications.iter().zip(original["applications"].as_array().unwrap())
        {
            for field in [
                "company",
                "role",
                "status",
                "jobUrl",
                "location",
                "salaryRange",
                "description",
                "appliedAt",
            ] {
                assert_eq!(restored[field], source[field], "{field}");
            }
            let contents = |application: &Value| -> Vec<String> {
                let mut contents: Vec<String> = application["notes"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|note| note["content"].as_str().unwrap().to_string())
                    .collect();
                contents.sort();
                contents
            };
            assert_eq!(contents(restored), contents(source));
            assert_eq!(restored["documents"], json!([]));
        }
    }

    #[tokio::test]
    async fn importing_rejects_a_file_that_is_not_an_export() {
        let (app, token) = app_with_user().await;

        let not_json = app.graphql(IMPORT, json!({ "data": "{oops" }), Auth::Bearer(&token)).await;
        assert_eq!(not_json.error_code(), "VALIDATION");
        assert_eq!(not_json.error_message(), "Import file is not valid JSON");
        assert_eq!(status_code(&not_json), 400);

        let no_array = app.graphql(IMPORT, json!({ "data": "{}" }), Auth::Bearer(&token)).await;
        assert_eq!(no_array.error_code(), "VALIDATION");
        assert_eq!(
            no_array.error_message(),
            "Import file must contain an \"applications\" array — export your data first"
        );
    }

    #[tokio::test]
    async fn importing_past_the_application_quota_skips_the_overflow() {
        let (app, token) = app_with_user().await;
        sqlx::query(r#"UPDATE "User" SET "applicationCount" = 49 WHERE "id" = 'ada'"#)
            .execute(app.db.pool())
            .await
            .unwrap();
        let data = json!({ "applications": [
            { "company": "Fits", "role": "Engineer" },
            { "company": "Over", "role": "Engineer", "notes": [{ "content": "lost" }] },
            { "company": "", "role": "Blank" },
        ] })
        .to_string();

        let imported = app.graphql(IMPORT, json!({ "data": data }), Auth::Bearer(&token)).await;

        assert_eq!(
            imported.data("importUserData"),
            &json!({
                "applicationsImported": 1,
                "applicationsSkipped": 2,
                "notesImported": 0,
                "documentsSkipped": 0,
            })
        );
        assert_eq!(count(&app.db, "JobApplication", "userId", "ada").await, 1);
    }

    #[tokio::test]
    async fn export_and_import_refuse_an_anonymous_caller() {
        let (app, _token) = app_with_user().await;

        let exported = app.graphql(EXPORT, json!({}), Auth::None).await;
        assert_eq!(exported.error_code(), "UNAUTHORIZED");
        let imported = app.graphql(IMPORT, json!({ "data": "{}" }), Auth::None).await;
        assert_eq!(imported.error_code(), "UNAUTHORIZED");
    }
}
