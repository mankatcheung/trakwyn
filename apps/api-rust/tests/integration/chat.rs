//! `Query.chatHistory`, through the real GraphQL endpoint.

use serde_json::json;
use sqlx::Executor;

use crate::common::{seed_user, Auth, TestApp};

const HISTORY: &str = "query($id: ID!) {
    chatHistory(conversationId: $id) { id role content createdAt }
}";

async fn seed_conversation(app: &TestApp, id: &str, user_id: &str) {
    sqlx::query(r#"INSERT INTO "Conversation" ("id", "userId", "createdAt", "updatedAt") VALUES ($1, $2, now(), now())"#)
        .bind(id)
        .bind(user_id)
        .execute(app.db.pool())
        .await
        .unwrap();
}

async fn seed_message(
    app: &TestApp,
    id: &str,
    conversation_id: &str,
    role: &str,
    content: &str,
    at: &str,
) {
    app.db
        .pool()
        .execute(
            sqlx::query(
                r#"INSERT INTO "Message" ("id", "conversationId", "role", "content", "createdAt")
                   VALUES ($1, $2, $3, $4, $5::timestamptz)"#,
            )
            .bind(id)
            .bind(conversation_id)
            .bind(role)
            .bind(content)
            .bind(at),
        )
        .await
        .unwrap();
}

async fn app() -> (TestApp, String) {
    let app = TestApp::start().await;
    seed_user(&app.db, "owner").await;
    let token = app.access_token("owner");
    (app, token)
}

#[tokio::test]
async fn returns_the_conversations_messages_oldest_first() {
    let (app, token) = app().await;
    seed_conversation(&app, "c1", "owner").await;
    seed_message(&app, "m2", "c1", "assistant", "Hello", "2026-01-01T10:00:02Z").await;
    seed_message(&app, "m1", "c1", "user", "Hi", "2026-01-01T10:00:01Z").await;

    let response = app.graphql(HISTORY, json!({ "id": "c1" }), Auth::Bearer(&token)).await;

    assert_eq!(
        response.data("chatHistory"),
        &json!([
            { "id": "m1", "role": "user", "content": "Hi", "createdAt": "2026-01-01T10:00:01.000Z" },
            { "id": "m2", "role": "assistant", "content": "Hello", "createdAt": "2026-01-01T10:00:02.000Z" },
        ])
    );
}

#[tokio::test]
async fn an_empty_conversation_has_no_messages() {
    let (app, token) = app().await;
    seed_conversation(&app, "c1", "owner").await;
    let response = app.graphql(HISTORY, json!({ "id": "c1" }), Auth::Bearer(&token)).await;
    assert_eq!(response.data("chatHistory"), &json!([]));
}

#[tokio::test]
async fn requires_authentication() {
    let (app, _) = app().await;
    let response = app.graphql(HISTORY, json!({ "id": "c1" }), Auth::None).await;
    assert_eq!(response.error_code(), "UNAUTHORIZED");
}

#[tokio::test]
async fn a_missing_conversation_is_not_found() {
    let (app, token) = app().await;
    let response = app.graphql(HISTORY, json!({ "id": "nope" }), Auth::Bearer(&token)).await;
    assert_eq!(response.error_code(), "NOT_FOUND");
    assert_eq!(response.error_message(), "Conversation not found");
}

#[tokio::test]
async fn another_users_conversation_is_forbidden() {
    let (app, token) = app().await;
    seed_user(&app.db, "stranger").await;
    seed_conversation(&app, "theirs", "stranger").await;
    seed_message(&app, "m1", "theirs", "user", "secret", "2026-01-01T10:00:01Z").await;

    let response = app.graphql(HISTORY, json!({ "id": "theirs" }), Auth::Bearer(&token)).await;

    assert_eq!(response.error_code(), "FORBIDDEN");
    assert!(!response.body.to_string().contains("secret"));
}
