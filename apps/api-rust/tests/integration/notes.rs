//! Notes through the real GraphQL endpoint and a real database.

use serde_json::{json, Value};

use crate::common::{seed_application, seed_user, Auth, TestApp};

const CREATE: &str = "mutation($applicationId: ID!, $content: String!) {
    createNote(applicationId: $applicationId, content: $content) {
        id applicationId content createdAt updatedAt
    }
}";
const LIST: &str =
    "query($applicationId: ID!) { notes(applicationId: $applicationId) { id content } }";
const UPDATE: &str =
    "mutation($id: ID!, $content: String!) { updateNote(id: $id, content: $content) { id content } }";
const DELETE: &str = "mutation($id: ID!) { deleteNote(id: $id) }";

async fn app_with_owner() -> (TestApp, String) {
    let app = TestApp::start().await;
    seed_user(&app.db, "owner").await;
    seed_application(&app.db, "app-1", "owner").await;
    let token = app.access_token("owner");
    (app, token)
}

async fn create(app: &TestApp, token: &str, content: &str) -> Value {
    let variables = json!({ "applicationId": "app-1", "content": content });
    app.graphql(CREATE, variables, Auth::Bearer(token)).await.data("createNote").clone()
}

fn is_iso_timestamp(value: &Value) -> bool {
    // 2026-01-31T09:30:00.000Z
    value.as_str().is_some_and(|text| {
        text.len() == 24
            && text.ends_with('Z')
            && text.as_bytes()[19] == b'.'
            && text.as_bytes()[10] == b'T'
    })
}

#[tokio::test]
async fn creates_a_note_and_records_the_activity() {
    let (app, token) = app_with_owner().await;

    let note = create(&app, &token, "Called the recruiter").await;

    assert_eq!(note["applicationId"], "app-1");
    assert_eq!(note["content"], "Called the recruiter");
    assert_eq!(note["id"].as_str().unwrap().len(), 21);
    assert!(is_iso_timestamp(&note["createdAt"]), "createdAt: {}", note["createdAt"]);
    assert_eq!(note["createdAt"], note["updatedAt"]);

    let (event_type, payload): (String, String) = sqlx::query_as(
        r#"SELECT "eventType", "payload" FROM "ActivityLog" WHERE "applicationId" = 'app-1'"#,
    )
    .fetch_one(app.db.pool())
    .await
    .unwrap();
    assert_eq!(event_type, "note_added");
    assert_eq!(payload, json!({ "noteId": note["id"] }).to_string());
}

#[tokio::test]
async fn lists_notes_newest_first() {
    let (app, token) = app_with_owner().await;
    create(&app, &token, "first").await;
    tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    create(&app, &token, "second").await;

    let response =
        app.graphql(LIST, json!({ "applicationId": "app-1" }), Auth::Bearer(&token)).await;

    let contents: Vec<&str> = response
        .data("notes")
        .as_array()
        .unwrap()
        .iter()
        .map(|note| note["content"].as_str().unwrap())
        .collect();
    assert_eq!(contents, vec!["second", "first"]);
}

#[tokio::test]
async fn updates_then_deletes_a_note() {
    let (app, token) = app_with_owner().await;
    let id = create(&app, &token, "draft").await["id"].clone();

    let updated =
        app.graphql(UPDATE, json!({ "id": id, "content": "final" }), Auth::Bearer(&token)).await;
    assert_eq!(updated.data("updateNote")["content"], "final");

    let deleted = app.graphql(DELETE, json!({ "id": id }), Auth::Bearer(&token)).await;
    assert_eq!(deleted.data("deleteNote"), &Value::Bool(true));

    let listed = app.graphql(LIST, json!({ "applicationId": "app-1" }), Auth::Bearer(&token)).await;
    assert_eq!(listed.data("notes"), &json!([]));
}

#[tokio::test]
async fn the_access_cookie_authenticates_like_a_bearer_token() {
    let (app, token) = app_with_owner().await;

    let response =
        app.graphql(LIST, json!({ "applicationId": "app-1" }), Auth::Cookie(&token)).await;

    assert_eq!(response.data("notes"), &json!([]));
}

#[tokio::test]
async fn an_anonymous_request_is_unauthorized() {
    let (app, _token) = app_with_owner().await;

    let response = app.graphql(LIST, json!({ "applicationId": "app-1" }), Auth::None).await;

    // GraphQL errors travel in a 200; the field is null and the code says why.
    assert_eq!(response.status, 200);
    assert_eq!(response.body["data"]["notes"], Value::Null);
    assert_eq!(response.error_code(), "UNAUTHORIZED");
    assert_eq!(response.error_message(), "Unauthorized");
    assert_eq!(response.body["errors"][0]["extensions"].get("statusCode"), None);
}

#[tokio::test]
async fn a_forged_token_is_unauthorized() {
    let (app, _token) = app_with_owner().await;

    let response =
        app.graphql(LIST, json!({ "applicationId": "app-1" }), Auth::Bearer("not.a.jwt")).await;

    assert_eq!(response.error_code(), "UNAUTHORIZED");
}

#[tokio::test]
async fn a_token_for_a_revoked_session_is_unauthorized() {
    let (app, token) = app_with_owner().await;
    app.container.session_blocklist.revoke("sid-owner").await;

    let response =
        app.graphql(LIST, json!({ "applicationId": "app-1" }), Auth::Bearer(&token)).await;

    assert_eq!(response.error_code(), "UNAUTHORIZED");
}

#[tokio::test]
async fn someone_elses_application_is_forbidden() {
    let (app, _token) = app_with_owner().await;
    seed_user(&app.db, "stranger").await;
    let stranger = app.access_token("stranger");

    let response = app
        .graphql(
            CREATE,
            json!({ "applicationId": "app-1", "content": "hi" }),
            Auth::Bearer(&stranger),
        )
        .await;

    assert_eq!(response.error_code(), "FORBIDDEN");
    assert_eq!(response.body["errors"][0]["extensions"]["statusCode"], 403);
    assert_eq!(response.body["data"]["createNote"], Value::Null);
}

#[tokio::test]
async fn an_unknown_application_is_not_found() {
    let (app, token) = app_with_owner().await;

    let response =
        app.graphql(LIST, json!({ "applicationId": "missing" }), Auth::Bearer(&token)).await;

    assert_eq!(response.error_code(), "NOT_FOUND");
    assert_eq!(response.error_message(), "Application not found");
    assert_eq!(response.body["errors"][0]["extensions"]["statusCode"], 404);
}

#[tokio::test]
async fn a_trashed_applications_notes_are_out_of_reach() {
    let (app, token) = app_with_owner().await;
    sqlx::query(r#"UPDATE "JobApplication" SET "deletedAt" = now() WHERE "id" = 'app-1'"#)
        .execute(app.db.pool())
        .await
        .unwrap();

    let response =
        app.graphql(LIST, json!({ "applicationId": "app-1" }), Auth::Bearer(&token)).await;

    assert_eq!(response.error_code(), "NOT_FOUND");
}
