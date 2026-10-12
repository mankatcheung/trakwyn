//! The notification inbox through the real GraphQL endpoint and a real
//! database.

use chrono::{DateTime, Utc};
use serde_json::{json, Value};

use trakwyn_api::domain::notification::NotificationType;
use trakwyn_api::use_cases::notifications::CreateNotificationInput;

use crate::common::{seed_user, Auth, TestApp};

const PAGE: &str = "query($cursor: String, $limit: Int) {
    notificationsPage(cursor: $cursor, limit: $limit) {
        items { id type title body url read createdAt }
        nextCursor
        hasNextPage
    }
}";
const UNREAD: &str = "{ unreadNotificationCount }";
const MARK: &str =
    "mutation($ids: [ID!]!, $isRead: Boolean!) { markNotificationsRead(ids: $ids, isRead: $isRead) }";

async fn app_with_owner() -> (TestApp, String) {
    let app = TestApp::start().await;
    seed_user(&app.db, "owner").await;
    let token = app.access_token("owner");
    (app, token)
}

/// Seeds `n01`…`nNN` for `user_id`, one second apart, so `nNN` is the newest.
async fn seed_notifications(app: &TestApp, user_id: &str, prefix: &str, count: usize) {
    for number in 1..=count {
        sqlx::query(
            r#"INSERT INTO "Notification" ("id", "userId", "type", "title", "body", "url", "createdAt")
               VALUES ($1, $2, 'follow_up_reminder', 'Follow up', 'Acme', NULL, $3)"#,
        )
        .bind(format!("{prefix}{number:02}"))
        .bind(user_id)
        .bind(DateTime::<Utc>::from_timestamp(1_700_000_000 + number as i64, 0).unwrap())
        .execute(app.db.pool())
        .await
        .unwrap();
    }
}

fn ids(page: &Value) -> Vec<&str> {
    page["items"].as_array().unwrap().iter().map(|item| item["id"].as_str().unwrap()).collect()
}

async fn page(app: &TestApp, token: &str, variables: Value) -> Value {
    app.graphql(PAGE, variables, Auth::Bearer(token)).await.data("notificationsPage").clone()
}

async fn unread(app: &TestApp, token: &str) -> Value {
    app.graphql(UNREAD, json!({}), Auth::Bearer(token))
        .await
        .data("unreadNotificationCount")
        .clone()
}

#[tokio::test]
async fn a_created_notification_appears_in_the_inbox_unread() {
    let (app, token) = app_with_owner().await;
    let created = app
        .container
        .create_notification_use_case()
        .execute(CreateNotificationInput {
            user_id: "owner".to_string(),
            notification_type: NotificationType::SecurityAlert,
            title: "New sign-in".to_string(),
            body: "From a new device".to_string(),
            url: Some("/settings/security".to_string()),
        })
        .await
        .unwrap();
    assert_eq!(created.id.len(), 21);

    let page = page(&app, &token, json!({})).await;

    assert_eq!(page["hasNextPage"], false);
    assert_eq!(page["nextCursor"], Value::Null);
    let item = &page["items"][0];
    assert_eq!(item["id"], created.id);
    assert_eq!(item["type"], "security_alert");
    assert_eq!(item["title"], "New sign-in");
    assert_eq!(item["body"], "From a new device");
    assert_eq!(item["url"], "/settings/security");
    assert_eq!(item["read"], false);
    assert!(item["createdAt"].as_str().unwrap().ends_with('Z'));
}

#[tokio::test]
async fn the_page_defaults_to_twenty_and_clamps_the_limit() {
    let (app, token) = app_with_owner().await;
    seed_notifications(&app, "owner", "n", 25).await;

    let default = page(&app, &token, json!({})).await;
    assert_eq!(ids(&default).len(), 20);
    assert_eq!(ids(&default)[0], "n25");
    assert_eq!(default["hasNextPage"], true);
    assert_eq!(default["nextCursor"], "n06");

    for limit in [0, -3] {
        let clamped = page(&app, &token, json!({ "limit": limit })).await;
        assert_eq!(ids(&clamped), vec!["n25"], "limit {limit}");
        assert_eq!(clamped["nextCursor"], "n25");
    }

    let everything = page(&app, &token, json!({ "limit": 1000 })).await;
    assert_eq!(ids(&everything).len(), 25);
    assert_eq!(everything["hasNextPage"], false);
    assert_eq!(everything["nextCursor"], Value::Null);
}

#[tokio::test]
async fn the_limit_is_capped_at_one_hundred() {
    let (app, token) = app_with_owner().await;
    seed_notifications(&app, "owner", "a", 99).await;
    seed_notifications(&app, "owner", "b", 6).await;

    let capped = page(&app, &token, json!({ "limit": 1000 })).await;

    assert_eq!(ids(&capped).len(), 100);
    assert_eq!(capped["hasNextPage"], true);
}

#[tokio::test]
async fn pages_through_the_inbox_with_the_cursor() {
    let (app, token) = app_with_owner().await;
    seed_notifications(&app, "owner", "n", 5).await;

    let first = page(&app, &token, json!({ "limit": 2 })).await;
    assert_eq!(ids(&first), vec!["n05", "n04"]);
    assert_eq!(first["nextCursor"], "n04");

    let second = page(&app, &token, json!({ "limit": 2, "cursor": first["nextCursor"] })).await;
    assert_eq!(ids(&second), vec!["n03", "n02"]);
    assert_eq!(second["hasNextPage"], true);

    let last = page(&app, &token, json!({ "limit": 2, "cursor": second["nextCursor"] })).await;
    assert_eq!(ids(&last), vec!["n01"]);
    assert_eq!(last["hasNextPage"], false);
    assert_eq!(last["nextCursor"], Value::Null);

    // An unknown cursor starts from the newest, as does a null one.
    let unknown = page(&app, &token, json!({ "limit": 2, "cursor": "gone" })).await;
    assert_eq!(ids(&unknown), vec!["n05", "n04"]);
    let null = page(&app, &token, json!({ "limit": 2, "cursor": null })).await;
    assert_eq!(ids(&null), vec!["n05", "n04"]);
}

#[tokio::test]
async fn marks_notifications_read_and_unread_and_counts_the_unread() {
    let (app, token) = app_with_owner().await;
    seed_notifications(&app, "owner", "n", 3).await;
    assert_eq!(unread(&app, &token).await, 3);

    let marked = app
        .graphql(MARK, json!({ "ids": ["n01", "n03"], "isRead": true }), Auth::Bearer(&token))
        .await;
    assert_eq!(marked.data("markNotificationsRead"), &Value::Bool(true));
    assert_eq!(unread(&app, &token).await, 1);

    let page_after = page(&app, &token, json!({})).await;
    let read: Vec<bool> = page_after["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|item| item["read"].as_bool().unwrap())
        .collect();
    assert_eq!(read, vec![true, false, true]);

    app.graphql(MARK, json!({ "ids": ["n01"], "isRead": false }), Auth::Bearer(&token))
        .await
        .data("markNotificationsRead");
    assert_eq!(unread(&app, &token).await, 2);
}

#[tokio::test]
async fn someone_elses_notifications_are_invisible_and_cannot_be_marked() {
    let (app, token) = app_with_owner().await;
    seed_user(&app.db, "stranger").await;
    let stranger = app.access_token("stranger");
    seed_notifications(&app, "owner", "n", 2).await;

    let foreign_page = page(&app, &stranger, json!({})).await;
    assert_eq!(foreign_page["items"], json!([]));
    assert_eq!(unread(&app, &stranger).await, 0);

    // Foreign ids are ignored rather than refused: the call succeeds and
    // changes nothing.
    let marked = app
        .graphql(MARK, json!({ "ids": ["n01", "n02"], "isRead": true }), Auth::Bearer(&stranger))
        .await;
    assert_eq!(marked.data("markNotificationsRead"), &Value::Bool(true));
    assert_eq!(unread(&app, &token).await, 2);
}

#[tokio::test]
async fn an_empty_or_oversized_batch_is_a_validation_error() {
    let (app, token) = app_with_owner().await;
    seed_notifications(&app, "owner", "n", 1).await;

    let empty = app.graphql(MARK, json!({ "ids": [], "isRead": true }), Auth::Bearer(&token)).await;
    assert_eq!(empty.error_code(), "VALIDATION");
    assert_eq!(empty.error_message(), "At least one notification id is required");
    assert_eq!(empty.body["errors"][0]["extensions"]["statusCode"], 400);

    let too_many: Vec<String> = (0..201).map(|number| format!("id-{number}")).collect();
    let oversized =
        app.graphql(MARK, json!({ "ids": too_many, "isRead": true }), Auth::Bearer(&token)).await;
    assert_eq!(oversized.error_code(), "VALIDATION");
    assert_eq!(oversized.error_message(), "Cannot act on more than 200 notifications at once");

    let mut at_the_limit: Vec<String> = (0..199).map(|number| format!("id-{number}")).collect();
    at_the_limit.push("n01".to_string());
    let allowed = app
        .graphql(MARK, json!({ "ids": at_the_limit, "isRead": true }), Auth::Bearer(&token))
        .await;
    assert_eq!(allowed.data("markNotificationsRead"), &Value::Bool(true));
    assert_eq!(unread(&app, &token).await, 0);
}

#[tokio::test]
async fn every_operation_needs_a_signed_in_user() {
    let (app, _token) = app_with_owner().await;
    seed_notifications(&app, "owner", "n", 1).await;
    let requests =
        [(PAGE, json!({})), (UNREAD, json!({})), (MARK, json!({ "ids": ["n01"], "isRead": true }))];

    for (query, variables) in requests {
        let response = app.graphql(query, variables, Auth::None).await;
        assert_eq!(response.error_code(), "UNAUTHORIZED", "{query}");
    }
    let read: i64 =
        sqlx::query_scalar(r#"SELECT count(*) FROM "Notification" WHERE "readAt" IS NOT NULL"#)
            .fetch_one(app.db.pool())
            .await
            .unwrap();
    assert_eq!(read, 0);
}
