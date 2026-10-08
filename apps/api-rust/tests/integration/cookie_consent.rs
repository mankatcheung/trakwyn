//! Cookie-consent recording through the real GraphQL endpoint and a real
//! database.

use axum::body::Body;
use axum::http::header::{CONTENT_TYPE, USER_AGENT};
use axum::http::Request;
use serde_json::{json, Value};

use crate::common::{seed_user, Auth, TestApp};

const RECORD: &str = "mutation($analyticsAccepted: Boolean!) {
    recordCookieConsent(analyticsAccepted: $analyticsAccepted)
}";

type ConsentRow = (String, bool, Option<String>, Option<String>);

async fn rows(app: &TestApp) -> Vec<ConsentRow> {
    sqlx::query_as(
        r#"SELECT "id", "analyticsAccepted", "ipAddress", "userAgent" FROM "CookieConsent""#,
    )
    .fetch_all(app.db.pool())
    .await
    .unwrap()
}

#[tokio::test]
async fn an_anonymous_visitor_records_a_decision_with_their_device() {
    let app = TestApp::start().await;
    let body = json!({ "query": RECORD, "variables": { "analyticsAccepted": true } }).to_string();
    let request = Request::post("/graphql")
        .header(CONTENT_TYPE, "application/json")
        .header(USER_AGENT, "Mozilla/5.0 (test)")
        .header("x-forwarded-for", "203.0.113.7, 10.0.0.1")
        .body(Body::from(body))
        .unwrap();

    let response = app.send(request).await;

    assert_eq!(response.data("recordCookieConsent"), &Value::Bool(true));
    let rows = rows(&app).await;
    assert_eq!(rows.len(), 1);
    let (id, accepted, ip_address, user_agent) = &rows[0];
    assert_eq!(id.len(), 21);
    assert!(accepted);
    assert_eq!(ip_address.as_deref(), Some("203.0.113.7"));
    assert_eq!(user_agent.as_deref(), Some("Mozilla/5.0 (test)"));
}

#[tokio::test]
async fn a_rejection_without_device_details_is_recorded_with_nulls() {
    let app = TestApp::start().await;

    let response = app.graphql(RECORD, json!({ "analyticsAccepted": false }), Auth::None).await;

    assert_eq!(response.data("recordCookieConsent"), &Value::Bool(true));
    let rows = rows(&app).await;
    assert_eq!(rows.len(), 1);
    assert!(!rows[0].1);
    assert_eq!(rows[0].3, None);
}

#[tokio::test]
async fn a_signed_in_user_may_record_one_too_and_each_call_adds_a_row() {
    let app = TestApp::start().await;
    seed_user(&app.db, "owner").await;
    let token = app.access_token("owner");

    for accepted in [true, false] {
        let response = app
            .graphql(RECORD, json!({ "analyticsAccepted": accepted }), Auth::Bearer(&token))
            .await;
        assert_eq!(response.data("recordCookieConsent"), &Value::Bool(true));
    }

    assert_eq!(rows(&app).await.len(), 2);
}

#[tokio::test]
async fn the_decision_is_required() {
    let app = TestApp::start().await;

    let response = app.graphql(RECORD, json!({}), Auth::None).await;

    assert!(response.body["errors"].is_array(), "{}", response.body);
    assert!(rows(&app).await.is_empty());
}
