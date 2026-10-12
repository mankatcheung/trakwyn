//! Helpers the auth, session, OAuth-account and security suites share.

use std::sync::Arc;

use axum::body::Body;
use axum::http::header::{CONTENT_TYPE, SET_COOKIE};
use axum::http::Request;
use serde_json::{json, Value};

use trakwyn_api::http::app::build_router;
use trakwyn_api::http::container::Container;
use trakwyn_api::infrastructure::db::repositories::{
    BlocklistingSessionRepository, LoggingSecurityEventRepository,
};
use trakwyn_api::infrastructure::db::Db;
use trakwyn_api::use_cases::clock::now;

use crate::common::{test_config, Response, TestApp, TestDb};

pub const PASSWORD: &str = "correct horse battery";
pub const ACCESS_COOKIE: &str = "trakwyn_access_token";
pub const REFRESH_COOKIE: &str = "trakwyn_refresh_token";
pub const LOGGED_IN_COOKIE: &str = "trakwyn_logged_in";

/// The app with the session and security-event repositories decorated the
/// way `apps/api` registers them: revocations reach the blocklist, and
/// security events are logged. `Container::new` wires the plain repositories
/// until the decorators are adopted there; once they are, this is just
/// `TestApp::start()`.
pub async fn start_app() -> TestApp {
    let TestDb { db } = TestDb::create().await;
    let mut config = test_config();
    // Two-factor secrets are encrypted at rest, so the 2FA tests need a key.
    config.auth.totp_encryption_key = Some("integration-test-totp-key".to_string());
    let mut container = Container::new(config, db.clone()).unwrap();
    container.session_repository = Arc::new(BlocklistingSessionRepository::new(
        container.session_repository.clone(),
        container.session_blocklist.clone(),
    ));
    container.security_event_repository = Arc::new(LoggingSecurityEventRepository::new(
        container.security_event_repository.clone(),
        container.services.logger.clone(),
        container.services.metrics.clone(),
    ));
    let container = Arc::new(container);
    TestApp { router: build_router(container.clone()), container, db }
}

/// Inserts a user who signs in with [`PASSWORD`]. The hash is cost 4, so
/// verifying it does not dominate the suite; the cost is read from the hash.
pub async fn seed_password_user(db: &Db, id: &str, email: &str) {
    let hash = bcrypt::hash(PASSWORD, 4).unwrap();
    sqlx::query(
        r#"INSERT INTO "User" ("id", "email", "passwordHash", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $4)"#,
    )
    .bind(id)
    .bind(email)
    .bind(hash)
    .bind(now())
    .execute(db.pool())
    .await
    .unwrap();
}

/// A GraphQL request with arbitrary headers (cookies, user agent, bearer).
pub async fn post(
    app: &TestApp,
    query: &str,
    variables: Value,
    headers: &[(&str, String)],
) -> Response {
    let mut builder = Request::post("/graphql").header(CONTENT_TYPE, "application/json");
    for (name, value) in headers {
        builder = builder.header(*name, value);
    }
    let body = json!({ "query": query, "variables": variables }).to_string();
    app.send(builder.body(Body::from(body)).unwrap()).await
}

pub fn bearer(token: &str) -> (&'static str, String) {
    ("authorization", format!("Bearer {token}"))
}

pub fn cookie(name: &str, value: &str) -> (&'static str, String) {
    ("cookie", format!("{name}={value}"))
}

pub fn user_agent(value: &str) -> (&'static str, String) {
    ("user-agent", value.to_string())
}

/// Every `Set-Cookie` value on a response, in order.
pub fn set_cookies(response: &Response) -> Vec<String> {
    response
        .headers
        .get_all(SET_COOKIE)
        .iter()
        .map(|value| value.to_str().unwrap().to_string())
        .collect()
}

/// The value a response set for the cookie `name`.
pub fn cookie_value(response: &Response, name: &str) -> Option<String> {
    set_cookies(response).iter().find_map(|cookie| {
        let (pair, _) = cookie.split_once(';').unwrap_or((cookie, ""));
        let (cookie_name, value) = pair.split_once('=')?;
        (cookie_name == name).then(|| value.to_string())
    })
}

/// Asserts the response started a session with exactly the three auth
/// cookies, attributes included, and returns `(access, refresh)`.
pub fn assert_signed_in(response: &Response) -> (String, String) {
    let cookies = set_cookies(response);
    assert_eq!(cookies.len(), 3, "{cookies:?}");
    let access = cookie_value(response, ACCESS_COOKIE).unwrap();
    let refresh = cookie_value(response, REFRESH_COOKIE).unwrap();
    assert_eq!(
        cookies,
        vec![
            format!("{ACCESS_COOKIE}={access}; Max-Age=900; Path=/; HttpOnly; SameSite=Lax"),
            format!("{REFRESH_COOKIE}={refresh}; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax"),
            format!("{LOGGED_IN_COOKIE}=1; Max-Age=604800; Path=/; SameSite=Lax"),
        ]
    );
    (access, refresh)
}

/// Asserts the response cleared all three auth cookies.
pub fn assert_signed_out(response: &Response) {
    let expired = "Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT";
    assert_eq!(
        set_cookies(response),
        vec![
            format!("{ACCESS_COOKIE}=; {expired}"),
            format!("{REFRESH_COOKIE}=; {expired}"),
            format!("{LOGGED_IN_COOKIE}=; {expired}"),
        ]
    );
}

pub const LOGIN: &str = "mutation($email: String!, $password: String!) {
    login(email: $email, password: $password) { success totpRequired accessToken }
}";

/// Signs in through the `login` mutation and returns `(access, refresh)`.
pub async fn login(app: &TestApp, email: &str, headers: &[(&str, String)]) -> (String, String) {
    let response = post(app, LOGIN, json!({ "email": email, "password": PASSWORD }), headers).await;
    assert_eq!(response.data("login")["success"], true, "{}", response.body);
    assert_signed_in(&response)
}

/// The `sid` claim of a token this app signed.
pub fn session_id(app: &TestApp, access_token: &str) -> String {
    app.container.token_service.verify_access(access_token).unwrap().sid.unwrap()
}
