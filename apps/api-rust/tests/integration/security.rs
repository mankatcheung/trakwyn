//! Login history and the merged security feed through the real endpoint.

use chrono::{DateTime, TimeDelta, Utc};
use serde_json::{json, Value};

use trakwyn_api::use_cases::clock::now;

use crate::common::{seed_user, Auth, TestApp};

const LOGIN_HISTORY: &str = "query { loginHistory { id ipAddress userAgent createdAt } }";
const SECURITY_ACTIVITY: &str =
    "query { securityActivity { id eventType ipAddress userAgent createdAt } }";

async fn app_with_owner() -> (TestApp, String) {
    let app = TestApp::start().await;
    seed_user(&app.db, "owner").await;
    seed_user(&app.db, "stranger").await;
    let token = app.access_token("owner");
    (app, token)
}

async fn seed_login(app: &TestApp, id: &str, user_id: &str, at: DateTime<Utc>) {
    sqlx::query(
        r#"INSERT INTO "LoginEvent" ("id", "userId", "ipAddress", "userAgent", "createdAt")
           VALUES ($1, $2, '203.0.113.7', 'Firefox', $3)"#,
    )
    .bind(id)
    .bind(user_id)
    .bind(at)
    .execute(app.db.pool())
    .await
    .unwrap();
}

async fn seed_event(app: &TestApp, id: &str, user_id: &str, event_type: &str, at: DateTime<Utc>) {
    sqlx::query(
        r#"INSERT INTO "SecurityEvent" ("id", "userId", "eventType", "userAgent", "createdAt")
           VALUES ($1, $2, $3, 'Safari', $4)"#,
    )
    .bind(id)
    .bind(user_id)
    .bind(event_type)
    .bind(at)
    .execute(app.db.pool())
    .await
    .unwrap();
}

fn ids(items: &Value) -> Vec<&str> {
    items.as_array().unwrap().iter().map(|item| item["id"].as_str().unwrap()).collect()
}

fn minutes_ago(minutes: i64) -> DateTime<Utc> {
    now() - TimeDelta::minutes(minutes)
}

#[tokio::test]
async fn login_history_is_the_callers_own_newest_first() {
    let (app, token) = app_with_owner().await;
    seed_login(&app, "older", "owner", minutes_ago(10)).await;
    seed_login(&app, "newer", "owner", minutes_ago(1)).await;
    seed_login(&app, "foreign", "stranger", minutes_ago(5)).await;

    let response = app.graphql(LOGIN_HISTORY, json!({}), Auth::Bearer(&token)).await;

    let history = response.data("loginHistory");
    assert_eq!(ids(history), vec!["newer", "older"]);
    assert_eq!(history[0]["ipAddress"], "203.0.113.7");
    assert_eq!(history[0]["userAgent"], "Firefox");
    assert_eq!(history[0]["createdAt"].as_str().unwrap().len(), 24);
}

#[tokio::test]
async fn login_history_shows_at_most_twenty() {
    let (app, token) = app_with_owner().await;
    for n in 0..22 {
        seed_login(&app, &format!("login-{n:02}"), "owner", minutes_ago(n)).await;
    }

    let response = app.graphql(LOGIN_HISTORY, json!({}), Auth::Bearer(&token)).await;

    let history = response.data("loginHistory");
    assert_eq!(history.as_array().unwrap().len(), 20);
    assert_eq!(history[0]["id"], "login-00");
    assert_eq!(history[19]["id"], "login-19");
}

#[tokio::test]
async fn security_activity_merges_logins_and_events_newest_first() {
    let (app, token) = app_with_owner().await;
    seed_login(&app, "login-old", "owner", minutes_ago(30)).await;
    seed_event(&app, "password", "owner", "password_changed", minutes_ago(20)).await;
    seed_login(&app, "login-new", "owner", minutes_ago(10)).await;
    seed_event(&app, "totp", "owner", "totp_enabled", minutes_ago(5)).await;
    seed_event(&app, "foreign", "stranger", "email_changed", minutes_ago(1)).await;

    let response = app.graphql(SECURITY_ACTIVITY, json!({}), Auth::Bearer(&token)).await;

    let activity = response.data("securityActivity");
    assert_eq!(ids(activity), vec!["totp", "login-new", "password", "login-old"]);
    assert_eq!(activity[0]["eventType"], "totp_enabled");
    assert_eq!(activity[0]["ipAddress"], Value::Null);
    assert_eq!(activity[0]["userAgent"], "Safari");
    assert_eq!(activity[1]["eventType"], "login");
    assert_eq!(activity[1]["ipAddress"], "203.0.113.7");
    assert_eq!(activity[2]["eventType"], "password_changed");
}

#[tokio::test]
async fn security_activity_keeps_the_twenty_most_recent_across_both_sources() {
    let (app, token) = app_with_owner().await;
    for n in 0..15 {
        seed_login(&app, &format!("login-{n:02}"), "owner", minutes_ago(2 * n + 1)).await;
        seed_event(&app, &format!("event-{n:02}"), "owner", "session_revoked", minutes_ago(2 * n))
            .await;
    }

    let response = app.graphql(SECURITY_ACTIVITY, json!({}), Auth::Bearer(&token)).await;

    let activity = response.data("securityActivity");
    assert_eq!(activity.as_array().unwrap().len(), 20);
    assert_eq!(ids(activity)[..4], ["event-00", "login-00", "event-01", "login-01"]);
    assert_eq!(activity[19]["id"], "login-09");
}

#[tokio::test]
async fn the_security_views_need_a_signed_in_user() {
    let (app, _token) = app_with_owner().await;

    for (query, field) in [(LOGIN_HISTORY, "loginHistory"), (SECURITY_ACTIVITY, "securityActivity")]
    {
        let response = app.graphql(query, json!({}), Auth::None).await;

        assert_eq!(response.error_code(), "UNAUTHORIZED", "{field}");
        assert_eq!(response.error_message(), "Unauthorized");
        assert_eq!(response.body["data"][field], Value::Null);
        assert_eq!(response.body["errors"][0]["extensions"].get("statusCode"), None);
    }
}
