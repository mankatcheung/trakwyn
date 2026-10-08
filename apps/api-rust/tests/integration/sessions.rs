//! Listing and revoking sessions through the real GraphQL endpoint.

use serde_json::{json, Value};

use crate::auth_support::*;
use crate::common::{Auth, TestApp};

const SESSIONS: &str = "query {
    sessions { id userAgent ipAddress deviceLabel location lastUsedAt createdAt current }
}";
const REVOKE: &str = "mutation($id: ID!) { revokeSession(id: $id) }";
const REVOKE_OTHERS: &str = "mutation { revokeOtherSessions }";

const EMAIL: &str = "ada@example.com";

async fn app_with_user() -> TestApp {
    let app = start_app().await;
    seed_password_user(&app.db, "user-1", EMAIL).await;
    app
}

async fn list(app: &TestApp, access_token: &str) -> Vec<Value> {
    post(app, SESSIONS, json!({}), &[bearer(access_token)])
        .await
        .data("sessions")
        .as_array()
        .unwrap()
        .clone()
}

async fn is_accepted(app: &TestApp, access_token: &str) -> bool {
    post(app, SESSIONS, json!({}), &[bearer(access_token)]).await.body.get("errors").is_none()
}

async fn security_events(app: &TestApp) -> Vec<(String, Option<String>, Option<String>)> {
    sqlx::query_as(r#"SELECT "eventType", "ipAddress", "userAgent" FROM "SecurityEvent""#)
        .fetch_all(app.db.pool())
        .await
        .unwrap()
}

#[tokio::test]
async fn lists_active_sessions_and_marks_the_callers_own() {
    let app = app_with_user().await;
    let (first, _) = login(&app, EMAIL, &[user_agent("Firefox")]).await;
    let headers = [user_agent("Safari"), ("x-forwarded-for", "10.1.2.3".to_string())];
    let (second, _) = login(&app, EMAIL, &headers).await;

    let sessions = list(&app, &second).await;

    assert_eq!(sessions.len(), 2);
    let mine = sessions.iter().find(|session| session["current"] == true).unwrap();
    assert_eq!(mine["id"], json!(session_id(&app, &second)));
    assert_eq!(mine["userAgent"], "Safari");
    assert_eq!(mine["ipAddress"], "10.1.2.3");
    assert!(mine["deviceLabel"].is_string());
    // A private address is never looked up.
    assert_eq!(mine["location"], Value::Null);
    assert_eq!(mine["createdAt"].as_str().unwrap().len(), 24);
    assert_eq!(mine["lastUsedAt"].as_str().unwrap().len(), 24);

    let other = sessions.iter().find(|session| session["current"] == false).unwrap();
    assert_eq!(other["id"], json!(session_id(&app, &first)));
    assert_eq!(other["userAgent"], "Firefox");
}

#[tokio::test]
async fn a_new_device_raises_a_security_alert_notification() {
    let app = app_with_user().await;
    login(&app, EMAIL, &[user_agent("Firefox")]).await;
    login(&app, EMAIL, &[user_agent("Firefox")]).await;
    login(&app, EMAIL, &[user_agent("Safari")]).await;

    // Only the third sign-in was from a device not seen before.
    let rows: Vec<(String, String, Option<String>)> = sqlx::query_as(
        r#"SELECT "type", "title", "url" FROM "Notification" WHERE "userId" = 'user-1'"#,
    )
    .fetch_all(app.db.pool())
    .await
    .unwrap();
    assert_eq!(
        rows,
        vec![(
            "security_alert".to_string(),
            "New sign-in detected".to_string(),
            Some("/settings/security#security-activity".to_string())
        )]
    );
}

#[tokio::test]
async fn revoking_a_session_kills_its_tokens_at_once_and_records_the_event() {
    let app = app_with_user().await;
    let (keeper, _) = login(&app, EMAIL, &[]).await;
    let (victim, _) = login(&app, EMAIL, &[]).await;

    let headers =
        [bearer(&keeper), user_agent("Firefox"), ("x-forwarded-for", "10.1.2.3".to_string())];
    let response = post(&app, REVOKE, json!({ "id": session_id(&app, &victim) }), &headers).await;

    assert_eq!(response.data("revokeSession"), &json!(true));
    assert!(!is_accepted(&app, &victim).await);
    assert!(is_accepted(&app, &keeper).await);
    assert_eq!(list(&app, &keeper).await.len(), 1);
    assert_eq!(
        security_events(&app).await,
        vec![(
            "session_revoked".to_string(),
            Some("10.1.2.3".to_string()),
            Some("Firefox".to_string())
        )]
    );
}

#[tokio::test]
async fn someone_elses_session_cannot_be_revoked() {
    let app = app_with_user().await;
    seed_password_user(&app.db, "user-2", "eve@example.com").await;
    let (mine, _) = login(&app, EMAIL, &[]).await;
    let (theirs, _) = login(&app, "eve@example.com", &[]).await;

    let response =
        post(&app, REVOKE, json!({ "id": session_id(&app, &mine) }), &[bearer(&theirs)]).await;

    assert_eq!(response.error_code(), "NOT_FOUND");
    assert_eq!(response.error_message(), "Session not found");
    assert_eq!(response.body["errors"][0]["extensions"]["statusCode"], 404);
    assert!(is_accepted(&app, &mine).await);
    assert!(security_events(&app).await.is_empty());
}

#[tokio::test]
async fn revoking_the_other_sessions_spares_only_the_callers() {
    let app = app_with_user().await;
    seed_password_user(&app.db, "user-2", "eve@example.com").await;
    let (current, _) = login(&app, EMAIL, &[]).await;
    let (other_1, _) = login(&app, EMAIL, &[]).await;
    let (other_2, _) = login(&app, EMAIL, &[]).await;
    let (foreign, _) = login(&app, "eve@example.com", &[]).await;

    let response = post(&app, REVOKE_OTHERS, json!({}), &[bearer(&current)]).await;

    assert_eq!(response.data("revokeOtherSessions"), &json!(true));
    assert!(is_accepted(&app, &current).await);
    assert!(!is_accepted(&app, &other_1).await);
    assert!(!is_accepted(&app, &other_2).await);
    assert!(is_accepted(&app, &foreign).await);
    assert_eq!(security_events(&app).await[0].0, "other_sessions_revoked");
}

#[tokio::test]
async fn the_session_operations_need_a_signed_in_user() {
    let app = app_with_user().await;

    for (query, variables, field) in [
        (SESSIONS, json!({}), "sessions"),
        (REVOKE, json!({ "id": "anything" }), "revokeSession"),
        (REVOKE_OTHERS, json!({}), "revokeOtherSessions"),
    ] {
        let response = app.graphql(query, variables, Auth::None).await;

        assert_eq!(response.error_code(), "UNAUTHORIZED", "{field}");
        assert_eq!(response.error_message(), "Unauthorized");
        assert_eq!(response.body["data"][field], Value::Null);
        assert_eq!(response.body["errors"][0]["extensions"].get("statusCode"), None);
    }
}
