//! Linked OAuth accounts through the real GraphQL endpoint.

use serde_json::{json, Value};

use trakwyn_api::use_cases::clock::now;

use crate::common::{seed_user, Auth, TestApp};

const LINKED: &str = "query { linkedOAuthAccounts { provider email createdAt } }";
const UNLINK: &str =
    "mutation($provider: OAuthProvider!) { unlinkOAuthAccount(provider: $provider) }";

/// A user with no password, as an OAuth sign-up leaves them.
async fn app_with_oauth_user() -> (TestApp, String) {
    let app = TestApp::start().await;
    seed_user(&app.db, "owner").await;
    let token = app.access_token("owner");
    (app, token)
}

async fn link(app: &TestApp, user_id: &str, provider: &str, email: Option<&str>) {
    sqlx::query(
        r#"INSERT INTO "OAuthAccount" ("id", "userId", "provider", "providerAccountId", "email", "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6)"#,
    )
    .bind(format!("{user_id}-{provider}"))
    .bind(user_id)
    .bind(provider)
    .bind(format!("{provider}-account-of-{user_id}"))
    .bind(email)
    .bind(now())
    .execute(app.db.pool())
    .await
    .unwrap();
}

async fn providers(app: &TestApp, token: &str) -> Vec<String> {
    let response = app.graphql(LINKED, json!({}), Auth::Bearer(token)).await;
    let mut providers: Vec<String> = response
        .data("linkedOAuthAccounts")
        .as_array()
        .unwrap()
        .iter()
        .map(|account| account["provider"].as_str().unwrap().to_string())
        .collect();
    providers.sort();
    providers
}

#[tokio::test]
async fn lists_only_the_callers_linked_accounts() {
    let (app, token) = app_with_oauth_user().await;
    seed_user(&app.db, "stranger").await;
    link(&app, "owner", "google", Some("owner@gmail.com")).await;
    link(&app, "stranger", "github", None).await;

    let response = app.graphql(LINKED, json!({}), Auth::Bearer(&token)).await;

    let accounts = response.data("linkedOAuthAccounts").as_array().unwrap();
    assert_eq!(accounts.len(), 1);
    // The enum is spelled lowercase on the wire.
    assert_eq!(accounts[0]["provider"], "google");
    assert_eq!(accounts[0]["email"], "owner@gmail.com");
    assert_eq!(accounts[0]["createdAt"].as_str().unwrap().len(), 24);
}

#[tokio::test]
async fn unlinks_a_provider_when_another_way_to_sign_in_remains() {
    let (app, token) = app_with_oauth_user().await;
    link(&app, "owner", "google", None).await;
    link(&app, "owner", "github", None).await;

    let response = app.graphql(UNLINK, json!({ "provider": "google" }), Auth::Bearer(&token)).await;

    assert_eq!(response.data("unlinkOAuthAccount"), &json!(true));
    assert_eq!(providers(&app, &token).await, vec!["github"]);
}

#[tokio::test]
async fn refuses_to_unlink_the_only_way_to_sign_in() {
    let (app, token) = app_with_oauth_user().await;
    link(&app, "owner", "google", None).await;

    let response = app.graphql(UNLINK, json!({ "provider": "google" }), Auth::Bearer(&token)).await;

    assert_eq!(response.error_code(), "VALIDATION");
    assert_eq!(
        response.error_message(),
        "Set a password before unlinking your only sign-in method"
    );
    assert_eq!(response.body["errors"][0]["extensions"]["statusCode"], 400);
    assert_eq!(providers(&app, &token).await, vec!["google"]);
}

#[tokio::test]
async fn a_password_makes_the_last_provider_removable() {
    let (app, token) = app_with_oauth_user().await;
    link(&app, "owner", "google", None).await;
    sqlx::query(r#"UPDATE "User" SET "passwordHash" = 'any-hash' WHERE "id" = 'owner'"#)
        .execute(app.db.pool())
        .await
        .unwrap();

    let response = app.graphql(UNLINK, json!({ "provider": "google" }), Auth::Bearer(&token)).await;

    assert_eq!(response.data("unlinkOAuthAccount"), &json!(true));
    assert!(providers(&app, &token).await.is_empty());
}

#[tokio::test]
async fn unlinking_a_provider_that_is_not_linked_is_a_no_op() {
    let (app, token) = app_with_oauth_user().await;
    link(&app, "owner", "google", None).await;

    let response = app.graphql(UNLINK, json!({ "provider": "github" }), Auth::Bearer(&token)).await;

    assert_eq!(response.data("unlinkOAuthAccount"), &json!(true));
    assert_eq!(providers(&app, &token).await, vec!["google"]);
}

#[tokio::test]
async fn an_unknown_provider_is_refused_by_the_schema() {
    let (app, token) = app_with_oauth_user().await;

    let response = app.graphql(UNLINK, json!({ "provider": "gitlab" }), Auth::Bearer(&token)).await;

    assert!(response.body["errors"][0]["message"].is_string(), "{}", response.body);
    assert_eq!(response.body["data"], Value::Null);
}

#[tokio::test]
async fn the_oauth_account_operations_need_a_signed_in_user() {
    let (app, _token) = app_with_oauth_user().await;

    let listed = app.graphql(LINKED, json!({}), Auth::None).await;
    assert_eq!(listed.error_code(), "UNAUTHORIZED");
    assert_eq!(listed.body["errors"][0]["extensions"].get("statusCode"), None);

    let unlinked = app.graphql(UNLINK, json!({ "provider": "google" }), Auth::None).await;
    assert_eq!(unlinked.error_code(), "UNAUTHORIZED");
    assert_eq!(unlinked.error_message(), "Unauthorized");
}
