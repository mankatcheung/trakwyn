//! TOTP enrolment, backup codes and disabling, through the real GraphQL
//! endpoint, a real database and the real TOTP provider.

use serde_json::{json, Value};

use crate::account_support::*;
use crate::common::{Auth, TestApp};

const BEGIN: &str = "mutation($password: String!) {
    beginTotpSetup(password: $password) { secret otpauthUrl qrCodeDataUrl }
}";
const CONFIRM: &str = "mutation($code: String!) { confirmTotpSetup(code: $code) { backupCodes } }";
const DISABLE: &str = "mutation($password: String!) { disableTotp(password: $password) }";
const REGENERATE: &str = "mutation($currentPassword: String!) {
    regenerateTotpBackupCodes(currentPassword: $currentPassword) { backupCodes }
}";
const ENABLED: &str = "{ totpEnabled }";

async fn app_with_user() -> (TestApp, String) {
    let app = TestApp::start_with(config_with_totp_key()).await;
    seed_account(&app.db, "ada").await;
    let token = fresh_token(&app, "ada");
    (app, token)
}

async fn is_enabled(app: &TestApp, token: &str) -> Value {
    app.graphql(ENABLED, json!({}), Auth::Bearer(token)).await.data("totpEnabled").clone()
}

async fn stored_code_hashes(app: &TestApp) -> Vec<String> {
    sqlx::query_scalar(
        r#"SELECT "codeHash" FROM "TotpBackupCode" WHERE "userId" = 'ada' ORDER BY "codeHash""#,
    )
    .fetch_all(app.db.pool())
    .await
    .unwrap()
}

fn backup_codes(payload: &Value) -> Vec<String> {
    payload["backupCodes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|code| code.as_str().unwrap().to_string())
        .collect()
}

fn sorted_hashes(codes: &[String]) -> Vec<String> {
    let mut hashes: Vec<String> = codes.iter().map(|code| sha256_hex(code)).collect();
    hashes.sort();
    hashes
}

/// Begins and confirms enrolment; returns the raw secret and backup codes.
async fn enrol(app: &TestApp, token: &str) -> (String, Vec<String>) {
    let begun = app.graphql(BEGIN, json!({ "password": PASSWORD }), Auth::Bearer(token)).await;
    let secret = begun.data("beginTotpSetup")["secret"].as_str().unwrap().to_string();
    let confirmed =
        graphql_from_device(app, CONFIRM, json!({ "code": totp_code(&secret) }), Some(token)).await;
    let codes = backup_codes(confirmed.data("confirmTotpSetup"));
    (secret, codes)
}

#[tokio::test]
async fn enrolment_stores_the_secret_encrypted_and_enables_2fa_only_once_confirmed() {
    let (app, token) = app_with_user().await;

    let begun = app.graphql(BEGIN, json!({ "password": PASSWORD }), Auth::Bearer(&token)).await;
    let setup = begun.data("beginTotpSetup");
    let secret = setup["secret"].as_str().unwrap();
    let otpauth_url = setup["otpauthUrl"].as_str().unwrap();
    assert!(otpauth_url.starts_with("otpauth://totp/"), "{otpauth_url}");
    assert!(otpauth_url.contains(&format!("secret={secret}")), "{otpauth_url}");
    assert!(otpauth_url.contains("ada%40example.com"), "{otpauth_url}");
    assert!(setup["qrCodeDataUrl"].as_str().unwrap().starts_with("data:image/png;base64,"));

    // At rest the secret is ciphertext the provider can read back, and the
    // account is not protected yet.
    let stored = user_column(&app.db, "ada", "totpSecret").await.unwrap();
    assert_ne!(stored, secret);
    assert!(!stored.contains(secret));
    assert_eq!(app.container.services.totp_provider.decrypt_secret(&stored).unwrap(), secret);
    assert_eq!(is_enabled(&app, &token).await, false);

    let confirmed =
        graphql_from_device(&app, CONFIRM, json!({ "code": totp_code(secret) }), Some(&token))
            .await;
    let codes = backup_codes(confirmed.data("confirmTotpSetup"));

    assert_eq!(is_enabled(&app, &token).await, true);
    // Ten 16-character lowercase hex codes, stored only as SHA-256 hex.
    assert_eq!(codes.len(), 10);
    assert!(codes.iter().all(|code| code.len() == 16
        && code.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))));
    assert_eq!(stored_code_hashes(&app).await, sorted_hashes(&codes));
    assert_eq!(
        security_events(&app.db, "ada").await,
        vec![(
            "totp_enabled".to_string(),
            Some(CLIENT_IP.to_string()),
            Some(USER_AGENT_VALUE.to_string())
        )]
    );
}

#[tokio::test]
async fn beginning_setup_needs_the_password_and_no_existing_2fa() {
    let (app, token) = app_with_user().await;

    let wrong =
        app.graphql(BEGIN, json!({ "password": WRONG_PASSWORD }), Auth::Bearer(&token)).await;
    assert_eq!(wrong.error_code(), "UNAUTHORIZED");
    assert_eq!(wrong.error_message(), "Invalid password");
    assert_eq!(status_code(&wrong), 401);
    assert_eq!(user_column(&app.db, "ada", "totpSecret").await, None);

    enrol(&app, &token).await;
    let again = app.graphql(BEGIN, json!({ "password": PASSWORD }), Auth::Bearer(&token)).await;
    assert_eq!(again.error_code(), "CONFLICT");
    assert_eq!(again.error_message(), "Two-factor authentication is already enabled");
    assert_eq!(status_code(&again), 409);
}

#[tokio::test]
async fn confirming_refuses_a_wrong_code_and_a_setup_that_was_never_begun() {
    let (app, token) = app_with_user().await;

    let not_begun = app.graphql(CONFIRM, json!({ "code": "123456" }), Auth::Bearer(&token)).await;
    assert_eq!(not_begun.error_code(), "CONFLICT");
    assert_eq!(not_begun.error_message(), "No two-factor setup in progress");

    let begun = app.graphql(BEGIN, json!({ "password": PASSWORD }), Auth::Bearer(&token)).await;
    let secret = begun.data("beginTotpSetup")["secret"].as_str().unwrap().to_string();
    let right = totp_code(&secret);
    let wrong_code = if right == "000000" { "000001" } else { "000000" };

    let wrong = app.graphql(CONFIRM, json!({ "code": wrong_code }), Auth::Bearer(&token)).await;
    assert_eq!(wrong.error_code(), "UNAUTHORIZED");
    assert_eq!(wrong.error_message(), "Invalid verification code");
    assert_eq!(is_enabled(&app, &token).await, false);
    assert!(stored_code_hashes(&app).await.is_empty());
}

#[tokio::test]
async fn regenerating_replaces_the_codes_and_needs_a_fresh_session() {
    let (app, token) = app_with_user().await;
    let (_secret, first) = enrol(&app, &token).await;

    let stale = stale_token(&app, "ada");
    let refused =
        app.graphql(REGENERATE, json!({ "currentPassword": PASSWORD }), Auth::Bearer(&stale)).await;
    assert_eq!(refused.error_code(), "STEP_UP_REQUIRED");
    assert_eq!(refused.error_message(), STEP_UP_MESSAGE);
    assert_eq!(status_code(&refused), 403);
    assert_eq!(stored_code_hashes(&app).await, sorted_hashes(&first));

    let wrong = app
        .graphql(REGENERATE, json!({ "currentPassword": WRONG_PASSWORD }), Auth::Bearer(&token))
        .await;
    assert_eq!(wrong.error_code(), "UNAUTHORIZED");

    let regenerated =
        app.graphql(REGENERATE, json!({ "currentPassword": PASSWORD }), Auth::Bearer(&token)).await;
    let second = backup_codes(regenerated.data("regenerateTotpBackupCodes"));
    assert_eq!(second.len(), 10);
    assert!(second.iter().all(|code| !first.contains(code)));
    assert_eq!(stored_code_hashes(&app).await, sorted_hashes(&second));

    let events: Vec<String> =
        security_events(&app.db, "ada").await.into_iter().map(|event| event.0).collect();
    assert_eq!(events, vec!["totp_enabled", "totp_backup_codes_regenerated"]);
}

#[tokio::test]
async fn regenerating_without_2fa_is_a_conflict() {
    let (app, token) = app_with_user().await;

    let response =
        app.graphql(REGENERATE, json!({ "currentPassword": PASSWORD }), Auth::Bearer(&token)).await;

    assert_eq!(response.error_code(), "CONFLICT");
    assert_eq!(response.error_message(), "Two-factor authentication is not enabled");
}

#[tokio::test]
async fn disabling_clears_the_secret_and_the_backup_codes() {
    let (app, token) = app_with_user().await;
    enrol(&app, &token).await;

    let wrong =
        app.graphql(DISABLE, json!({ "password": WRONG_PASSWORD }), Auth::Bearer(&token)).await;
    assert_eq!(wrong.error_code(), "UNAUTHORIZED");
    assert_eq!(is_enabled(&app, &token).await, true);

    // Only the password is asked for: a stale session may turn 2FA off, as in
    // `apps/api`.
    let stale = stale_token(&app, "ada");
    let disabled =
        graphql_from_device(&app, DISABLE, json!({ "password": PASSWORD }), Some(&stale)).await;
    assert_eq!(disabled.data("disableTotp"), &Value::Bool(true));

    assert_eq!(is_enabled(&app, &token).await, false);
    assert_eq!(user_column(&app.db, "ada", "totpSecret").await, None);
    assert!(stored_code_hashes(&app).await.is_empty());
    let last = security_events(&app.db, "ada").await.pop().unwrap();
    assert_eq!(last.0, "totp_disabled");
    assert_eq!(last.1.as_deref(), Some(CLIENT_IP));
}

#[tokio::test]
async fn every_totp_operation_refuses_an_anonymous_caller() {
    let (app, _token) = app_with_user().await;
    let operations = [
        ("totpEnabled", ENABLED, json!({})),
        ("beginTotpSetup", BEGIN, json!({ "password": PASSWORD })),
        ("confirmTotpSetup", CONFIRM, json!({ "code": "123456" })),
        ("disableTotp", DISABLE, json!({ "password": PASSWORD })),
        ("regenerateTotpBackupCodes", REGENERATE, json!({ "currentPassword": PASSWORD })),
    ];

    for (field, query, variables) in operations {
        let response = app.graphql(query, variables, Auth::None).await;
        assert_eq!(response.error_code(), "UNAUTHORIZED", "{field}");
        assert_eq!(response.body["data"][field], Value::Null, "{field}");
    }
}
