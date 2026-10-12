//! Destroying applications for good, through the real GraphQL endpoint and a
//! real database.

use serde_json::{json, Value};

use crate::applications::app_with_owner;
use crate::common::{seed_application, seed_user, Auth, TestApp};

const DELETE: &str = "mutation($id: ID!) { deleteApplication(id: $id) }";
const DESTROY: &str = "mutation($id: ID!) { permanentlyDeleteApplication(id: $id) }";
const EMPTY: &str = "mutation { emptyTrash { deleted failed } }";

async fn seeded() -> (TestApp, String) {
    let (app, token) = app_with_owner().await;
    seed_user(&app.db, "stranger").await;
    for id in ["a", "b", "c"] {
        seed_application(&app.db, id, "owner").await;
    }
    seed_application(&app.db, "theirs", "stranger").await;
    (app, token)
}

async fn trash(app: &TestApp, token: &str, id: &str) {
    let response = app.graphql(DELETE, json!({ "id": id }), Auth::Bearer(token)).await;
    assert_eq!(response.data("deleteApplication"), &Value::Bool(true));
}

async fn remaining_ids(app: &TestApp) -> Vec<String> {
    sqlx::query_scalar(r#"SELECT "id" FROM "JobApplication" ORDER BY "id""#)
        .fetch_all(app.db.pool())
        .await
        .unwrap()
}

#[tokio::test]
async fn permanently_deleting_removes_the_row_and_what_hangs_off_it() {
    let (app, token) = seeded().await;
    sqlx::query(
        r#"INSERT INTO "Note" ("id", "applicationId", "content", "createdAt", "updatedAt")
           VALUES ('n1', 'a', 'x', now(), now())"#,
    )
    .execute(app.db.pool())
    .await
    .unwrap();
    trash(&app, &token, "a").await;

    let response = app.graphql(DESTROY, json!({ "id": "a" }), Auth::Bearer(&token)).await;

    assert_eq!(response.data("permanentlyDeleteApplication"), &Value::Bool(true));
    assert_eq!(remaining_ids(&app).await, vec!["b", "c", "theirs"]);
    let notes: i64 = sqlx::query_scalar(r#"SELECT count(*) FROM "Note""#)
        .fetch_one(app.db.pool())
        .await
        .unwrap();
    assert_eq!(notes, 0);
}

#[tokio::test]
async fn permanently_deleting_gives_the_quota_slot_back() {
    let (app, token) = seeded().await;
    sqlx::query(r#"UPDATE "User" SET "applicationCount" = 3 WHERE "id" = 'owner'"#)
        .execute(app.db.pool())
        .await
        .unwrap();

    app.graphql(DESTROY, json!({ "id": "a" }), Auth::Bearer(&token)).await;

    let count: i32 =
        sqlx::query_scalar(r#"SELECT "applicationCount" FROM "User" WHERE "id" = 'owner'"#)
            .fetch_one(app.db.pool())
            .await
            .unwrap();
    assert_eq!(count, 2);
}

#[tokio::test]
async fn someone_elses_application_cannot_be_destroyed() {
    let (app, token) = seeded().await;

    let response = app.graphql(DESTROY, json!({ "id": "theirs" }), Auth::Bearer(&token)).await;

    assert_eq!(response.error_code(), "FORBIDDEN");
    assert_eq!(remaining_ids(&app).await.len(), 4);
}

#[tokio::test]
async fn an_unknown_application_is_not_found() {
    let (app, token) = seeded().await;

    let response = app.graphql(DESTROY, json!({ "id": "missing" }), Auth::Bearer(&token)).await;

    assert_eq!(response.error_code(), "NOT_FOUND");
    assert_eq!(response.error_message(), "Application not found");
}

#[tokio::test]
async fn emptying_trash_destroys_only_the_callers_trashed_applications() {
    let (app, token) = seeded().await;
    trash(&app, &token, "a").await;
    trash(&app, &token, "b").await;
    sqlx::query(r#"UPDATE "JobApplication" SET "deletedAt" = now() WHERE "id" = 'theirs'"#)
        .execute(app.db.pool())
        .await
        .unwrap();

    let response = app.graphql(EMPTY, json!({}), Auth::Bearer(&token)).await;

    assert_eq!(response.data("emptyTrash"), &json!({ "deleted": 2, "failed": 0 }));
    assert_eq!(remaining_ids(&app).await, vec!["c", "theirs"]);
}

#[tokio::test]
async fn emptying_an_empty_trash_reports_zero() {
    let (app, token) = seeded().await;

    let response = app.graphql(EMPTY, json!({}), Auth::Bearer(&token)).await;

    assert_eq!(response.data("emptyTrash"), &json!({ "deleted": 0, "failed": 0 }));
    assert_eq!(remaining_ids(&app).await.len(), 4);
}

#[tokio::test]
async fn both_mutations_need_a_signed_in_user() {
    let (app, _token) = seeded().await;

    let destroy = app.graphql(DESTROY, json!({ "id": "a" }), Auth::None).await;
    let empty = app.graphql(EMPTY, json!({}), Auth::None).await;

    assert_eq!(destroy.error_code(), "UNAUTHORIZED");
    assert_eq!(empty.error_code(), "UNAUTHORIZED");
    assert_eq!(remaining_ids(&app).await.len(), 4);
}
