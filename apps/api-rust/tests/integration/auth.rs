//! Cookie-based sign-in through the real GraphQL endpoint and a real database.

use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use trakwyn_api::use_cases::clock::now;

use crate::auth_support::*;
use crate::common::TestApp;

const REGISTER: &str = "mutation($email: String!, $password: String!) {
    register(email: $email, password: $password)
}";
const LOGIN_WITH_TOTP: &str = "mutation($email: String!, $password: String!, $code: String!) {
    loginWithTotp(email: $email, password: $password, code: $code)
}";
const REAUTHENTICATE: &str = "mutation($password: String!, $code: String) {
    reauthenticate(password: $password, code: $code) { success totpRequired accessToken }
}";
const REFRESH: &str = "mutation { refreshToken }";
const LOGOUT: &str = "mutation { logout }";
const SESSIONS: &str = "query { sessions { id current } }";
const REQUEST_RESET: &str = "mutation($email: String!) { requestPasswordReset(email: $email) }";
const RESET: &str = "mutation($token: String!, $newPassword: String!) {
    resetPassword(token: $token, newPassword: $newPassword)
}";
const VERIFY_EMAIL: &str = "mutation($token: String!) { verifyEmail(token: $token) }";
const BACKUP_RECOVERY: &str =
    "mutation($backupEmail: String!) { requestBackupEmailRecovery(backupEmail: $backupEmail) }";

const EMAIL: &str = "ada@example.com";
/// `bcryptjs@3`: `bcrypt.hashSync('correct horse battery', 12)`.
const BCRYPTJS_HASH: &str = "$2b$12$lQWwQjG7UpSu3o6oDMQnBeUJcPtVDxKWUUZjrTxiAZHk2l8KSjHVS";

fn sha256_hex(value: &str) -> String {
    hex::encode(Sha256::digest(value.as_bytes()))
}

async fn app_with_user() -> TestApp {
    let app = start_app().await;
    seed_password_user(&app.db, "user-1", EMAIL).await;
    app
}

/// Whether the access token still authenticates a guarded query.
async fn is_accepted(app: &TestApp, access_token: &str) -> bool {
    post(app, SESSIONS, json!({}), &[bearer(access_token)]).await.body.get("errors").is_none()
}

async fn count(app: &TestApp, sql: &str) -> i64 {
    sqlx::query_scalar(sql).fetch_one(app.db.pool()).await.unwrap()
}

fn status_code(response: &crate::common::Response) -> &Value {
    &response.body["errors"][0]["extensions"]["statusCode"]
}

// ── register ──

#[tokio::test]
async fn register_creates_the_account_signs_in_and_sets_the_cookies() {
    let app = start_app().await;

    let response = post(
        &app,
        REGISTER,
        json!({ "email": "new@example.com", "password": "long enough" }),
        &[user_agent("Mozilla/5.0 Firefox/130.0")],
    )
    .await;

    let (access, refresh) = assert_signed_in(&response);
    assert_eq!(response.data("register"), &json!(access));
    assert!(is_accepted(&app, &access).await);

    let (user_id, hash): (String, String) = sqlx::query_as(
        r#"SELECT "id", "passwordHash" FROM "User" WHERE "email" = 'new@example.com'"#,
    )
    .fetch_one(app.db.pool())
    .await
    .unwrap();
    assert_eq!(user_id.len(), 21);
    // The cost and format `apps/api` writes, so either can verify it.
    assert!(hash.starts_with("$2b$12$") && hash.len() == 60, "{hash}");

    let claims = app.container.token_service.verify_refresh(&refresh).unwrap();
    assert_eq!(claims.sub, user_id);
    assert_eq!(claims.email, "new@example.com");
    let (session_user, current_jti, agent): (String, String, String) = sqlx::query_as(
        r#"SELECT "userId", "currentRefreshTokenId", "userAgent" FROM "Session" WHERE "id" = $1"#,
    )
    .bind(&claims.sid)
    .fetch_one(app.db.pool())
    .await
    .unwrap();
    assert_eq!(session_user, user_id);
    assert_eq!(Some(current_jti), claims.jti);
    assert_eq!(agent, "Mozilla/5.0 Firefox/130.0");

    // A verification link was minted for the new account.
    let token_hash: String =
        sqlx::query_scalar(r#"SELECT "tokenHash" FROM "EmailVerificationToken""#)
            .fetch_one(app.db.pool())
            .await
            .unwrap();
    assert_eq!(token_hash.len(), 64);
}

#[tokio::test]
async fn register_refuses_a_taken_email_and_a_short_password_without_cookies() {
    let app = app_with_user().await;

    let taken =
        post(&app, REGISTER, json!({ "email": EMAIL, "password": "long enough" }), &[]).await;
    assert_eq!(taken.error_code(), "CONFLICT");
    assert_eq!(taken.error_message(), "Email already registered");
    assert_eq!(status_code(&taken), 409);
    assert!(set_cookies(&taken).is_empty());

    let short =
        post(&app, REGISTER, json!({ "email": "new@example.com", "password": "short" }), &[]).await;
    assert_eq!(short.error_code(), "VALIDATION");
    assert_eq!(short.error_message(), "Password must be at least 8 characters");
    assert_eq!(status_code(&short), 400);
    assert_eq!(count(&app, r#"SELECT count(*) FROM "User""#).await, 1);
}

// ── login ──

#[tokio::test]
async fn login_sets_the_cookies_and_records_the_login() {
    let app = app_with_user().await;

    let headers = [user_agent("Firefox"), ("x-forwarded-for", "10.1.2.3".to_string())];
    let (access, _refresh) = login(&app, EMAIL, &headers).await;

    assert!(is_accepted(&app, &access).await);
    let (ip, agent): (String, String) = sqlx::query_as(
        r#"SELECT "ipAddress", "userAgent" FROM "LoginEvent" WHERE "userId" = 'user-1'"#,
    )
    .fetch_one(app.db.pool())
    .await
    .unwrap();
    assert_eq!((ip.as_str(), agent.as_str()), ("10.1.2.3", "Firefox"));
}

#[tokio::test]
async fn login_tells_an_unknown_email_from_a_wrong_password() {
    let app = app_with_user().await;

    let wrong = post(&app, LOGIN, json!({ "email": EMAIL, "password": "wrong horse" }), &[]).await;
    assert_eq!(wrong.error_code(), "UNAUTHORIZED");
    assert_eq!(wrong.error_message(), "Invalid credentials");
    assert_eq!(status_code(&wrong), 401);
    assert_eq!(wrong.body["data"]["login"], Value::Null);
    assert!(set_cookies(&wrong).is_empty());

    let unknown =
        post(&app, LOGIN, json!({ "email": "nobody@example.com", "password": PASSWORD }), &[])
            .await;
    assert_eq!(unknown.error_code(), "USER_NOT_FOUND");
    assert_eq!(unknown.error_message(), "No account found with this email. Please register first.");
    assert_eq!(status_code(&unknown), 404);

    assert_eq!(count(&app, r#"SELECT count(*) FROM "Session""#).await, 0);
    assert_eq!(count(&app, r#"SELECT count(*) FROM "LoginEvent""#).await, 0);
}

#[tokio::test]
async fn a_password_hashed_by_apps_api_signs_in_here() {
    let app = app_with_user().await;
    sqlx::query(r#"UPDATE "User" SET "passwordHash" = $1 WHERE "id" = 'user-1'"#)
        .bind(BCRYPTJS_HASH)
        .execute(app.db.pool())
        .await
        .unwrap();

    login(&app, EMAIL, &[]).await;
}

#[tokio::test]
async fn an_oauth_only_account_cannot_sign_in_with_a_password() {
    let app = app_with_user().await;
    sqlx::query(r#"UPDATE "User" SET "passwordHash" = NULL"#).execute(app.db.pool()).await.unwrap();

    let response = post(&app, LOGIN, json!({ "email": EMAIL, "password": PASSWORD }), &[]).await;

    assert_eq!(response.error_code(), "UNAUTHORIZED");
    assert_eq!(
        response.error_message(),
        "This account has no password set. Sign in with a linked provider instead."
    );
}

// ── two-factor ──

/// Turns 2FA on for the seeded user, with one unused backup code.
async fn enable_totp(app: &TestApp, backup_code: &str) {
    let totp = &app.container.services.totp_provider;
    let secret = totp.encrypt_secret(&totp.generate_secret()).unwrap();
    sqlx::query(
        r#"UPDATE "User" SET "totpEnabled" = true, "totpSecret" = $1 WHERE "id" = 'user-1'"#,
    )
    .bind(secret)
    .execute(app.db.pool())
    .await
    .unwrap();
    sqlx::query(
        r#"INSERT INTO "TotpBackupCode" ("id", "userId", "codeHash", "createdAt")
           VALUES ('backup-1', 'user-1', $1, $2)"#,
    )
    .bind(sha256_hex(backup_code))
    .bind(now())
    .execute(app.db.pool())
    .await
    .unwrap();
}

#[tokio::test]
async fn login_stops_for_the_second_factor_and_login_with_totp_completes_it() {
    let app = app_with_user().await;
    enable_totp(&app, "ABCD-EFGH").await;

    let first = post(&app, LOGIN, json!({ "email": EMAIL, "password": PASSWORD }), &[]).await;
    assert_eq!(
        first.data("login"),
        &json!({ "success": false, "totpRequired": true, "accessToken": null })
    );
    // Not signed in yet: no cookies and no session.
    assert!(set_cookies(&first).is_empty());
    assert_eq!(count(&app, r#"SELECT count(*) FROM "Session""#).await, 0);

    let variables = |code: &str| json!({ "email": EMAIL, "password": PASSWORD, "code": code });
    let wrong = post(&app, LOGIN_WITH_TOTP, variables("000000"), &[]).await;
    assert_eq!(wrong.error_code(), "UNAUTHORIZED");
    assert_eq!(wrong.error_message(), "Invalid verification code");
    assert!(set_cookies(&wrong).is_empty());

    let second = post(&app, LOGIN_WITH_TOTP, variables("ABCD-EFGH"), &[]).await;
    let (access, _refresh) = assert_signed_in(&second);
    assert_eq!(second.data("loginWithTotp"), &json!(access));
    assert!(is_accepted(&app, &access).await);

    // The backup code is spent.
    let replay = post(&app, LOGIN_WITH_TOTP, variables("ABCD-EFGH"), &[]).await;
    assert_eq!(replay.error_message(), "Invalid verification code");
}

#[tokio::test]
async fn the_second_factor_is_rate_limited_per_email() {
    let app = app_with_user().await;
    enable_totp(&app, "ABCD-EFGH").await;
    let variables = json!({ "email": EMAIL, "password": PASSWORD, "code": "000000" });

    for _ in 0..5 {
        let response = post(&app, LOGIN_WITH_TOTP, variables.clone(), &[]).await;
        assert_eq!(response.error_message(), "Invalid verification code");
    }
    let limited = post(&app, LOGIN_WITH_TOTP, variables, &[]).await;

    assert_eq!(limited.error_code(), "RATE_LIMITED");
    assert_eq!(limited.error_message(), "Too many verification attempts. Please try again later.");
    assert_eq!(status_code(&limited), 429);
}

// ── refreshToken ──

#[tokio::test]
async fn refresh_rotates_the_token_resets_the_cookies_and_keeps_the_auth_time() {
    let app = app_with_user().await;
    let (access, refresh) = login(&app, EMAIL, &[]).await;
    let before = app.container.token_service.verify_refresh(&refresh).unwrap();

    let response = post(&app, REFRESH, json!({}), &[cookie(REFRESH_COOKIE, &refresh)]).await;

    let (new_access, new_refresh) = assert_signed_in(&response);
    assert_eq!(response.data("refreshToken"), &json!(new_access));
    assert!(is_accepted(&app, &new_access).await);

    let after = app.container.token_service.verify_refresh(&new_refresh).unwrap();
    assert_eq!(after.sid, before.sid);
    assert_ne!(after.jti, before.jti);
    // Refreshing is not re-authenticating.
    assert!(before.auth_time.is_some());
    assert_eq!(after.auth_time, before.auth_time);
    let access_claims = app.container.token_service.verify_access(&new_access).unwrap();
    assert_eq!(access_claims.auth_time, before.auth_time);
    assert_eq!(access_claims.sid, Some(session_id(&app, &access)));

    let (current, previous): (String, String) = sqlx::query_as(
        r#"SELECT "currentRefreshTokenId", "previousRefreshTokenId" FROM "Session""#,
    )
    .fetch_one(app.db.pool())
    .await
    .unwrap();
    assert_eq!(Some(current), after.jti);
    assert_eq!(Some(previous), before.jti);
}

#[tokio::test]
async fn the_superseded_token_is_tolerated_briefly_then_kills_the_session() {
    let app = app_with_user().await;
    let (_access, refresh) = login(&app, EMAIL, &[]).await;
    let first = post(&app, REFRESH, json!({}), &[cookie(REFRESH_COOKIE, &refresh)]).await;
    let (new_access, new_refresh) = assert_signed_in(&first);
    let current = app.container.token_service.verify_refresh(&new_refresh).unwrap().jti;

    // A second tab racing with the old token converges on the same id.
    let race = post(&app, REFRESH, json!({}), &[cookie(REFRESH_COOKIE, &refresh)]).await;
    let (_, raced_refresh) = assert_signed_in(&race);
    assert_eq!(app.container.token_service.verify_refresh(&raced_refresh).unwrap().jti, current);

    // Once the grace window has passed, the same token is reuse.
    sqlx::query(
        r#"UPDATE "Session" SET "previousRotatedAt" = "previousRotatedAt" - interval '1 minute'"#,
    )
    .execute(app.db.pool())
    .await
    .unwrap();
    let reuse = post(&app, REFRESH, json!({}), &[cookie(REFRESH_COOKIE, &refresh)]).await;

    assert_eq!(reuse.error_code(), "UNAUTHORIZED");
    assert_eq!(reuse.error_message(), "Session revoked or expired");
    assert_eq!(status_code(&reuse), 401);
    assert_signed_out(&reuse);
    assert_eq!(
        count(&app, r#"SELECT count(*) FROM "Session" WHERE "revokedAt" IS NOT NULL"#).await,
        1
    );
    // The whole session is dead at once: the legitimate holder's tokens too.
    assert!(!is_accepted(&app, &new_access).await);
    let legitimate = post(&app, REFRESH, json!({}), &[cookie(REFRESH_COOKIE, &new_refresh)]).await;
    assert_eq!(legitimate.error_message(), "Session revoked or expired");
}

#[tokio::test]
async fn refresh_without_a_cookie_is_unauthorized_and_clears_the_cookies() {
    let app = app_with_user().await;

    let response = post(&app, REFRESH, json!({}), &[cookie(LOGGED_IN_COOKIE, "1")]).await;

    assert_eq!(response.error_code(), "UNAUTHORIZED");
    assert_eq!(response.error_message(), "No refresh token");
    // Raised by the resolver itself: a code and no status.
    assert_eq!(response.body["errors"][0]["extensions"].get("statusCode"), None);
    assert_signed_out(&response);
}

#[tokio::test]
async fn refresh_with_an_invalid_token_is_unauthorized_and_clears_the_cookies() {
    let app = app_with_user().await;
    let (access, _refresh) = login(&app, EMAIL, &[]).await;

    // Neither garbage nor an access token passes for a refresh token.
    for token in ["not.a.jwt", access.as_str()] {
        let response = post(&app, REFRESH, json!({}), &[cookie(REFRESH_COOKIE, token)]).await;

        assert_eq!(response.error_code(), "UNAUTHORIZED");
        assert_eq!(response.error_message(), "Invalid refresh token");
        assert_eq!(status_code(&response), 401);
        assert_signed_out(&response);
    }
}

// ── logout ──

#[tokio::test]
async fn logout_revokes_the_session_at_once_and_clears_the_cookies() {
    let app = app_with_user().await;
    let (access, refresh) = login(&app, EMAIL, &[]).await;
    assert!(is_accepted(&app, &access).await);

    let response = post(&app, LOGOUT, json!({}), &[cookie(ACCESS_COOKIE, &access)]).await;

    assert_eq!(response.data("logout"), &json!(true));
    assert_signed_out(&response);
    // The access token is refused immediately, not at its natural expiry (JEF-164).
    assert!(!is_accepted(&app, &access).await);
    let refreshed = post(&app, REFRESH, json!({}), &[cookie(REFRESH_COOKIE, &refresh)]).await;
    assert_eq!(refreshed.error_message(), "Session revoked or expired");

    let (event_type, ip): (String, Option<String>) =
        sqlx::query_as(r#"SELECT "eventType", "ipAddress" FROM "SecurityEvent""#)
            .fetch_one(app.db.pool())
            .await
            .unwrap();
    assert_eq!(event_type, "session_revoked");
    assert_eq!(ip, None);
}

#[tokio::test]
async fn logout_without_a_session_still_clears_the_cookies() {
    let app = app_with_user().await;

    let response = post(&app, LOGOUT, json!({}), &[]).await;

    assert_eq!(response.data("logout"), &json!(true));
    assert_signed_out(&response);
}

// ── reauthenticate ──

#[tokio::test]
async fn reauthenticate_re_signs_the_same_session_with_a_fresh_auth_time() {
    let app = app_with_user().await;
    let (access, _refresh) = login(&app, EMAIL, &[]).await;
    let before = app.container.token_service.verify_access(&access).unwrap();
    tokio::time::sleep(std::time::Duration::from_millis(5)).await;

    let response =
        post(&app, REAUTHENTICATE, json!({ "password": PASSWORD }), &[bearer(&access)]).await;

    let (new_access, new_refresh) = assert_signed_in(&response);
    assert_eq!(
        response.data("reauthenticate"),
        &json!({ "success": true, "totpRequired": false, "accessToken": new_access })
    );
    let after = app.container.token_service.verify_access(&new_access).unwrap();
    assert_eq!(after.sid, before.sid);
    assert!(after.auth_time > before.auth_time);
    assert_eq!(count(&app, r#"SELECT count(*) FROM "Session""#).await, 1);
    // The re-signed refresh token is the session's current one.
    let refreshed = post(&app, REFRESH, json!({}), &[cookie(REFRESH_COOKIE, &new_refresh)]).await;
    assert_signed_in(&refreshed);
}

#[tokio::test]
async fn reauthenticate_refuses_a_wrong_password_and_an_anonymous_caller() {
    let app = app_with_user().await;
    let (access, _refresh) = login(&app, EMAIL, &[]).await;

    let wrong =
        post(&app, REAUTHENTICATE, json!({ "password": "wrong horse" }), &[bearer(&access)]).await;
    assert_eq!(wrong.error_code(), "UNAUTHORIZED");
    assert_eq!(wrong.error_message(), "Invalid credentials");
    assert_eq!(status_code(&wrong), 401);
    assert!(set_cookies(&wrong).is_empty());

    let anonymous = post(&app, REAUTHENTICATE, json!({ "password": PASSWORD }), &[]).await;
    assert_eq!(anonymous.error_code(), "UNAUTHORIZED");
    assert_eq!(anonymous.error_message(), "Unauthorized");
    assert_eq!(anonymous.body["errors"][0]["extensions"].get("statusCode"), None);
}

#[tokio::test]
async fn reauthenticate_asks_for_the_code_when_two_factor_is_on() {
    let app = app_with_user().await;
    let (access, _refresh) = login(&app, EMAIL, &[]).await;
    enable_totp(&app, "ABCD-EFGH").await;

    let asked =
        post(&app, REAUTHENTICATE, json!({ "password": PASSWORD }), &[bearer(&access)]).await;
    assert_eq!(
        asked.data("reauthenticate"),
        &json!({ "success": false, "totpRequired": true, "accessToken": null })
    );
    assert!(set_cookies(&asked).is_empty());

    let variables = json!({ "password": PASSWORD, "code": "ABCD-EFGH" });
    let done = post(&app, REAUTHENTICATE, variables, &[bearer(&access)]).await;
    assert_eq!(done.data("reauthenticate")["success"], true);
    assert_signed_in(&done);
}

#[tokio::test]
async fn reauthenticate_on_a_session_revoked_in_the_database_is_unauthorized() {
    let app = app_with_user().await;
    let (access, _refresh) = login(&app, EMAIL, &[]).await;
    // Revoked behind the blocklist's back, as another instance might see it.
    sqlx::query(r#"UPDATE "Session" SET "revokedAt" = $1"#)
        .bind(now())
        .execute(app.db.pool())
        .await
        .unwrap();

    let response =
        post(&app, REAUTHENTICATE, json!({ "password": PASSWORD }), &[bearer(&access)]).await;

    assert_eq!(response.error_code(), "UNAUTHORIZED");
    assert_eq!(response.error_message(), "Session expired — please log in again");
    assert_eq!(status_code(&response), 401);
}

// ── password reset and email verification ──

#[tokio::test]
async fn requesting_a_reset_mints_a_token_only_for_a_real_account() {
    let app = app_with_user().await;

    let unknown = post(&app, REQUEST_RESET, json!({ "email": "nobody@example.com" }), &[]).await;
    assert_eq!(unknown.data("requestPasswordReset"), &json!(true));
    assert_eq!(count(&app, r#"SELECT count(*) FROM "PasswordResetToken""#).await, 0);

    let known = post(&app, REQUEST_RESET, json!({ "email": EMAIL }), &[]).await;
    assert_eq!(known.data("requestPasswordReset"), &json!(true));
    let (user_id, token_hash, lifetime_s): (String, String, f64) = sqlx::query_as(
        r#"SELECT "userId", "tokenHash",
                  extract(epoch FROM "expiresAt" - "createdAt")::float8
           FROM "PasswordResetToken""#,
    )
    .fetch_one(app.db.pool())
    .await
    .unwrap();
    assert_eq!(user_id, "user-1");
    assert_eq!(token_hash.len(), 64);
    assert!((lifetime_s - 3600.0).abs() < 5.0, "{lifetime_s}");
}

#[tokio::test]
async fn reset_requests_are_rate_limited_per_email() {
    let app = app_with_user().await;

    for _ in 0..5 {
        let response =
            post(&app, REQUEST_RESET, json!({ "email": "Nobody@example.com" }), &[]).await;
        assert_eq!(response.data("requestPasswordReset"), &json!(true));
    }
    // The key is the lowercased address.
    let limited = post(&app, REQUEST_RESET, json!({ "email": "nobody@EXAMPLE.com" }), &[]).await;

    assert_eq!(limited.error_code(), "RATE_LIMITED");
    assert_eq!(limited.error_message(), "Too many password reset requests. Try again later.");
    assert_eq!(status_code(&limited), 429);
}

async fn seed_reset_token(app: &TestApp, raw: &str) {
    sqlx::query(
        r#"INSERT INTO "PasswordResetToken" ("id", "userId", "tokenHash", "expiresAt", "createdAt")
           VALUES ('reset-1', 'user-1', $1, $2, $3)"#,
    )
    .bind(sha256_hex(raw))
    .bind(now() + chrono::TimeDelta::minutes(30))
    .bind(now())
    .execute(app.db.pool())
    .await
    .unwrap();
}

#[tokio::test]
async fn resetting_the_password_revokes_every_session() {
    let app = app_with_user().await;
    let (access, _refresh) = login(&app, EMAIL, &[]).await;
    // A link as `apps/api` mails it: only the SHA-256 of the raw token is stored.
    seed_reset_token(&app, "raw-reset-token").await;

    let variables = json!({ "token": "raw-reset-token", "newPassword": "a brand new one" });
    let response = post(&app, RESET, variables.clone(), &[]).await;

    assert_eq!(response.data("resetPassword"), &json!(true));
    assert!(!is_accepted(&app, &access).await);
    let old = post(&app, LOGIN, json!({ "email": EMAIL, "password": PASSWORD }), &[]).await;
    assert_eq!(old.error_message(), "Invalid credentials");
    let new =
        post(&app, LOGIN, json!({ "email": EMAIL, "password": "a brand new one" }), &[]).await;
    assert_eq!(new.data("login")["success"], true);

    // The link is single-use.
    let replay = post(&app, RESET, variables, &[]).await;
    assert_eq!(replay.error_code(), "UNAUTHORIZED");
    assert_eq!(replay.error_message(), "Invalid or expired reset link");
}

#[tokio::test]
async fn resetting_with_a_bad_token_or_a_short_password_fails() {
    let app = app_with_user().await;
    seed_reset_token(&app, "raw-reset-token").await;

    let unknown =
        post(&app, RESET, json!({ "token": "other", "newPassword": "long enough" }), &[]).await;
    assert_eq!(unknown.error_message(), "Invalid or expired reset link");
    assert_eq!(status_code(&unknown), 401);

    let short =
        post(&app, RESET, json!({ "token": "raw-reset-token", "newPassword": "short" }), &[]).await;
    assert_eq!(short.error_code(), "VALIDATION");
}

#[tokio::test]
async fn verifying_an_email_marks_the_user_and_spends_the_token() {
    let app = app_with_user().await;
    sqlx::query(
        r#"INSERT INTO "EmailVerificationToken" ("id", "userId", "tokenHash", "expiresAt", "createdAt")
           VALUES ('verify-1', 'user-1', $1, $2, $3)"#,
    )
    .bind(sha256_hex("raw-verify-token"))
    .bind(now() + chrono::TimeDelta::hours(1))
    .bind(now())
    .execute(app.db.pool())
    .await
    .unwrap();

    let response = post(&app, VERIFY_EMAIL, json!({ "token": "raw-verify-token" }), &[]).await;

    assert_eq!(response.data("verifyEmail"), &json!(true));
    assert_eq!(
        count(&app, r#"SELECT count(*) FROM "User" WHERE "emailVerifiedAt" IS NOT NULL"#).await,
        1
    );
    let replay = post(&app, VERIFY_EMAIL, json!({ "token": "raw-verify-token" }), &[]).await;
    assert_eq!(replay.error_code(), "UNAUTHORIZED");
    assert_eq!(replay.error_message(), "Invalid or expired verification link");
}

#[tokio::test]
async fn backup_email_recovery_mints_a_token_only_for_a_verified_backup_address() {
    let app = app_with_user().await;
    sqlx::query(r#"UPDATE "User" SET "backupEmail" = 'backup@example.com'"#)
        .execute(app.db.pool())
        .await
        .unwrap();
    let variables = json!({ "backupEmail": "backup@example.com" });

    let unverified = post(&app, BACKUP_RECOVERY, variables.clone(), &[]).await;
    assert_eq!(unverified.data("requestBackupEmailRecovery"), &json!(true));
    assert_eq!(count(&app, r#"SELECT count(*) FROM "PasswordResetToken""#).await, 0);

    sqlx::query(r#"UPDATE "User" SET "backupEmailVerifiedAt" = $1"#)
        .bind(now())
        .execute(app.db.pool())
        .await
        .unwrap();
    let verified = post(&app, BACKUP_RECOVERY, variables, &[]).await;
    assert_eq!(verified.data("requestBackupEmailRecovery"), &json!(true));
    assert_eq!(count(&app, r#"SELECT count(*) FROM "PasswordResetToken""#).await, 1);
}
