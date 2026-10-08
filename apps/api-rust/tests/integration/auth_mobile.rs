//! The mobile sign-in mutations: tokens in the body, never in cookies.

use serde_json::{json, Value};

use trakwyn_api::infrastructure::auth::create_pkce_pair;

use crate::auth_support::*;
use crate::common::TestApp;

const REGISTER: &str = "mutation($email: String!, $password: String!) {
    registerMobile(email: $email, password: $password) { accessToken refreshToken }
}";
const LOGIN_MOBILE: &str = "mutation($email: String!, $password: String!) {
    loginMobile(email: $email, password: $password) {
        success totpRequired accessToken refreshToken
    }
}";
const LOGIN_WITH_TOTP: &str = "mutation($email: String!, $password: String!, $code: String!) {
    loginWithTotpMobile(email: $email, password: $password, code: $code) {
        accessToken refreshToken
    }
}";
const REFRESH: &str = "mutation($refreshToken: String!) {
    refreshTokenMobile(refreshToken: $refreshToken) { accessToken refreshToken }
}";
const REAUTHENTICATE: &str = "mutation($password: String!, $code: String) {
    reauthenticateMobile(password: $password, code: $code) {
        success totpRequired accessToken refreshToken
    }
}";
const EXCHANGE: &str = "mutation($code: String!, $codeVerifier: String!) {
    exchangeMobileOAuthCode(code: $code, codeVerifier: $codeVerifier) {
        accessToken refreshToken
    }
}";
const SESSIONS: &str = "query { sessions { id } }";

const EMAIL: &str = "ada@example.com";

async fn app_with_user() -> TestApp {
    let app = start_app().await;
    seed_password_user(&app.db, "user-1", EMAIL).await;
    app
}

async fn is_accepted(app: &TestApp, access_token: &str) -> bool {
    post(app, SESSIONS, json!({}), &[bearer(access_token)]).await.body.get("errors").is_none()
}

fn text(value: &Value) -> String {
    value.as_str().unwrap_or_else(|| panic!("expected a string, got {value}")).to_string()
}

/// Signs in through `loginMobile` and returns `(access, refresh)`.
async fn login_mobile(app: &TestApp) -> (String, String) {
    let response =
        post(app, LOGIN_MOBILE, json!({ "email": EMAIL, "password": PASSWORD }), &[]).await;
    let result = response.data("loginMobile");
    assert_eq!(result["success"], true);
    assert!(set_cookies(&response).is_empty());
    (text(&result["accessToken"]), text(&result["refreshToken"]))
}

#[tokio::test]
async fn register_mobile_returns_a_usable_token_pair_and_sets_no_cookies() {
    let app = start_app().await;

    let response = post(
        &app,
        REGISTER,
        json!({ "email": "new@example.com", "password": "long enough" }),
        &[user_agent("Trakwyn/1.0 (iOS)")],
    )
    .await;

    let payload = response.data("registerMobile");
    assert!(set_cookies(&response).is_empty());
    assert!(is_accepted(&app, &text(&payload["accessToken"])).await);
    let claims =
        app.container.token_service.verify_refresh(&text(&payload["refreshToken"])).unwrap();
    assert_eq!(claims.email, "new@example.com");
    assert!(claims.jti.is_some());
}

#[tokio::test]
async fn login_mobile_returns_tokens_and_rejects_the_wrong_password() {
    let app = app_with_user().await;

    let (access, _refresh) = login_mobile(&app).await;
    assert!(is_accepted(&app, &access).await);

    let wrong =
        post(&app, LOGIN_MOBILE, json!({ "email": EMAIL, "password": "wrong horse" }), &[]).await;
    assert_eq!(wrong.error_code(), "UNAUTHORIZED");
    assert_eq!(wrong.error_message(), "Invalid credentials");
    assert_eq!(wrong.body["errors"][0]["extensions"]["statusCode"], 401);

    let unknown =
        post(&app, LOGIN_MOBILE, json!({ "email": "no@example.com", "password": PASSWORD }), &[])
            .await;
    assert_eq!(unknown.error_code(), "USER_NOT_FOUND");
}

#[tokio::test]
async fn login_mobile_stops_for_the_second_factor() {
    let app = app_with_user().await;
    let totp = &app.container.services.totp_provider;
    let secret = totp.encrypt_secret(&totp.generate_secret()).unwrap();
    sqlx::query(r#"UPDATE "User" SET "totpEnabled" = true, "totpSecret" = $1"#)
        .bind(secret)
        .execute(app.db.pool())
        .await
        .unwrap();

    let response =
        post(&app, LOGIN_MOBILE, json!({ "email": EMAIL, "password": PASSWORD }), &[]).await;
    assert_eq!(
        response.data("loginMobile"),
        &json!({ "success": false, "totpRequired": true, "accessToken": null, "refreshToken": null })
    );

    let variables = json!({ "email": EMAIL, "password": PASSWORD, "code": "000000" });
    let wrong = post(&app, LOGIN_WITH_TOTP, variables, &[]).await;
    assert_eq!(wrong.error_code(), "UNAUTHORIZED");
    assert_eq!(wrong.error_message(), "Invalid verification code");
}

#[tokio::test]
async fn refresh_token_mobile_rotates_and_refuses_an_invalid_token() {
    let app = app_with_user().await;
    let (_access, refresh) = login_mobile(&app).await;
    let before = app.container.token_service.verify_refresh(&refresh).unwrap();

    let response = post(&app, REFRESH, json!({ "refreshToken": refresh }), &[]).await;

    let payload = response.data("refreshTokenMobile");
    assert!(set_cookies(&response).is_empty());
    assert!(is_accepted(&app, &text(&payload["accessToken"])).await);
    let after =
        app.container.token_service.verify_refresh(&text(&payload["refreshToken"])).unwrap();
    assert_eq!(after.sid, before.sid);
    assert_ne!(after.jti, before.jti);
    assert_eq!(after.auth_time, before.auth_time);

    let invalid = post(&app, REFRESH, json!({ "refreshToken": "not.a.jwt" }), &[]).await;
    assert_eq!(invalid.error_code(), "UNAUTHORIZED");
    assert_eq!(invalid.error_message(), "Invalid refresh token");
    assert_eq!(invalid.body["errors"][0]["extensions"]["statusCode"], 401);
    // The cookie mutation clears cookies on failure; the mobile one has none.
    assert!(set_cookies(&invalid).is_empty());
}

#[tokio::test]
async fn reauthenticate_mobile_re_signs_the_session_without_cookies() {
    let app = app_with_user().await;
    let (access, _refresh) = login_mobile(&app).await;
    let before = app.container.token_service.verify_access(&access).unwrap();
    tokio::time::sleep(std::time::Duration::from_millis(5)).await;

    let response =
        post(&app, REAUTHENTICATE, json!({ "password": PASSWORD }), &[bearer(&access)]).await;

    let result = response.data("reauthenticateMobile");
    assert_eq!(result["success"], true);
    assert_eq!(result["totpRequired"], false);
    assert!(set_cookies(&response).is_empty());
    let after = app.container.token_service.verify_access(&text(&result["accessToken"])).unwrap();
    assert_eq!(after.sid, before.sid);
    assert!(after.auth_time > before.auth_time);
    // The refresh token in the body is the session's current one.
    let refreshed =
        post(&app, REFRESH, json!({ "refreshToken": result["refreshToken"] }), &[]).await;
    assert!(refreshed.data("refreshTokenMobile")["accessToken"].is_string());

    let wrong =
        post(&app, REAUTHENTICATE, json!({ "password": "wrong horse" }), &[bearer(&access)]).await;
    assert_eq!(wrong.error_message(), "Invalid credentials");
    let anonymous = post(&app, REAUTHENTICATE, json!({ "password": PASSWORD }), &[]).await;
    assert_eq!(anonymous.error_message(), "Unauthorized");
    assert_eq!(anonymous.body["errors"][0]["extensions"].get("statusCode"), None);
}

#[tokio::test]
async fn exchange_mobile_oauth_code_redeems_a_handoff_code_once_verified() {
    let app = app_with_user().await;
    let (access, refresh) = login_mobile(&app).await;
    let pkce = create_pkce_pair();
    // What the OAuth callback hands the app through its custom-scheme redirect.
    let code = app.container.services.mobile_oauth_handoff_service.issue(
        &access,
        &refresh,
        &pkce.challenge,
    );

    let response =
        post(&app, EXCHANGE, json!({ "code": code, "codeVerifier": pkce.verifier }), &[]).await;
    assert_eq!(
        response.data("exchangeMobileOAuthCode"),
        &json!({ "accessToken": access, "refreshToken": refresh })
    );
    assert!(set_cookies(&response).is_empty());

    let other = create_pkce_pair();
    for (code, verifier) in [(code.as_str(), other.verifier.as_str()), ("forged", &pkce.verifier)] {
        let refused =
            post(&app, EXCHANGE, json!({ "code": code, "codeVerifier": verifier }), &[]).await;
        assert_eq!(refused.error_code(), "UNAUTHORIZED");
        assert_eq!(refused.error_message(), "Invalid or expired OAuth handoff code");
        assert_eq!(refused.body["errors"][0]["extensions"]["statusCode"], 401);
    }
}
