//! Push subscription registration through the real GraphQL endpoint and a
//! real database.

use serde_json::json;

use crate::common::{seed_user, Auth, TestApp};

const REGISTER_WEB: &str = "mutation($endpoint: String!, $p256dh: String!, $auth: String!) {
    registerPushSubscription(endpoint: $endpoint, p256dh: $p256dh, auth: $auth)
}";
const REGISTER_EXPO: &str = "mutation($token: String!) { registerExpoPushToken(token: $token) }";
const UNREGISTER: &str =
    "mutation($endpoint: String!) { unregisterPushSubscription(endpoint: $endpoint) }";

async fn app_with(users: &[&str]) -> TestApp {
    let app = TestApp::start().await;
    for user in users {
        seed_user(&app.db, user).await;
    }
    app
}

type Row = (String, String, String, Option<String>, Option<String>);

async fn rows(app: &TestApp) -> Vec<Row> {
    sqlx::query_as(
        r#"SELECT "userId", "provider", "endpoint", "p256dh", "auth"
           FROM "PushSubscription" ORDER BY "endpoint""#,
    )
    .fetch_all(app.db.pool())
    .await
    .unwrap()
}

fn web_vars(endpoint: &str) -> serde_json::Value {
    json!({ "endpoint": endpoint, "p256dh": "key", "auth": "secret" })
}

#[tokio::test]
async fn registers_a_web_subscription_with_its_keys() {
    let app = app_with(&["u1"]).await;
    let token = app.access_token("u1");

    let response =
        app.graphql(REGISTER_WEB, web_vars("https://push.test/1"), Auth::Bearer(&token)).await;

    assert_eq!(response.data("registerPushSubscription"), &json!(true));
    assert_eq!(
        rows(&app).await,
        vec![(
            "u1".to_string(),
            "web".to_string(),
            "https://push.test/1".to_string(),
            Some("key".to_string()),
            Some("secret".to_string())
        )]
    );
}

#[tokio::test]
async fn registering_an_endpoint_again_repoints_the_row_to_the_new_user() {
    let app = app_with(&["u1", "u2"]).await;
    let first = app.access_token("u1");
    let second = app.access_token("u2");
    app.graphql(REGISTER_WEB, web_vars("https://push.test/1"), Auth::Bearer(&first)).await;

    let response = app
        .graphql(
            REGISTER_WEB,
            json!({ "endpoint": "https://push.test/1", "p256dh": "new-key", "auth": "new-auth" }),
            Auth::Bearer(&second),
        )
        .await;

    assert_eq!(response.data("registerPushSubscription"), &json!(true));
    let stored = rows(&app).await;
    assert_eq!(stored.len(), 1);
    assert_eq!(stored[0].0, "u2");
    assert_eq!(stored[0].3.as_deref(), Some("new-key"));
}

#[tokio::test]
async fn registers_an_expo_token_as_a_keyless_expo_row() {
    let app = app_with(&["u1"]).await;
    let token = app.access_token("u1");

    let response = app
        .graphql(REGISTER_EXPO, json!({ "token": "ExponentPushToken[abc]" }), Auth::Bearer(&token))
        .await;

    assert_eq!(response.data("registerExpoPushToken"), &json!(true));
    assert_eq!(
        rows(&app).await,
        vec![(
            "u1".to_string(),
            "expo".to_string(),
            "ExponentPushToken[abc]".to_string(),
            None,
            None
        )]
    );
}

#[tokio::test]
async fn unregisters_a_subscription_of_either_provider_by_endpoint() {
    let app = app_with(&["u1"]).await;
    let token = app.access_token("u1");
    app.graphql(REGISTER_WEB, web_vars("https://push.test/1"), Auth::Bearer(&token)).await;
    app.graphql(REGISTER_EXPO, json!({ "token": "ExponentPushToken[abc]" }), Auth::Bearer(&token))
        .await;

    let web = app
        .graphql(UNREGISTER, json!({ "endpoint": "https://push.test/1" }), Auth::Bearer(&token))
        .await;
    let expo = app
        .graphql(UNREGISTER, json!({ "endpoint": "ExponentPushToken[abc]" }), Auth::Bearer(&token))
        .await;

    assert_eq!(web.data("unregisterPushSubscription"), &json!(true));
    assert_eq!(expo.data("unregisterPushSubscription"), &json!(true));
    assert!(rows(&app).await.is_empty());
}

#[tokio::test]
async fn unregistering_an_unknown_endpoint_still_succeeds() {
    let app = app_with(&["u1"]).await;
    let token = app.access_token("u1");

    let response = app
        .graphql(UNREGISTER, json!({ "endpoint": "https://push.test/never" }), Auth::Bearer(&token))
        .await;

    assert_eq!(response.data("unregisterPushSubscription"), &json!(true));
}

#[tokio::test]
async fn every_mutation_needs_a_signed_in_user() {
    let app = app_with(&["u1"]).await;

    let web = app.graphql(REGISTER_WEB, web_vars("https://push.test/1"), Auth::None).await;
    let expo = app.graphql(REGISTER_EXPO, json!({ "token": "t" }), Auth::None).await;
    let unregister = app.graphql(UNREGISTER, json!({ "endpoint": "e" }), Auth::None).await;

    assert_eq!(web.error_code(), "UNAUTHORIZED");
    assert_eq!(expo.error_code(), "UNAUTHORIZED");
    assert_eq!(unregister.error_code(), "UNAUTHORIZED");
    assert!(rows(&app).await.is_empty());
}
