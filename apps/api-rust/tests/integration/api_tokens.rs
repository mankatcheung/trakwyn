//! API tokens through the real GraphQL endpoint and a real database, and
//! API-token authentication over `Authorization: Bearer`.

use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use trakwyn_api::use_cases::clock::now;

use crate::common::{seed_user, Auth, TestApp};

const CREATE: &str = "mutation($name: String!, $scope: ApiTokenScope) {
    createApiToken(name: $name, scope: $scope) { id name token scope createdAt }
}";
const LIST: &str = "{ apiTokens { id name scope lastUsedAt createdAt } }";
const DELETE: &str = "mutation($id: ID!) { deleteApiToken(id: $id) }";

/// A token and its hash as `apps/api` mints and stores them. The hash was
/// printed by Node: `createHash('sha256').update(raw).digest('hex')`.
const NODE_RAW_TOKEN: &str = "trakwyn_000102030405060708090a0b0c0d0e0f1011121314151617";
const NODE_TOKEN_HASH: &str = "95dea8f28333f6549e7ab5b85a2cdf84700c4c4b67b320a846665f52f65cecfc";

async fn app_with_owner() -> (TestApp, String) {
    let app = TestApp::start().await;
    seed_user(&app.db, "owner").await;
    let token = app.access_token("owner");
    (app, token)
}

async fn create(app: &TestApp, token: &str, name: &str, scope: Option<&str>) -> Value {
    app.graphql(CREATE, json!({ "name": name, "scope": scope }), Auth::Bearer(token))
        .await
        .data("createApiToken")
        .clone()
}

async fn count(app: &TestApp) -> i64 {
    sqlx::query_scalar(r#"SELECT count(*) FROM "ApiToken""#).fetch_one(app.db.pool()).await.unwrap()
}

/// Inserts a token row the way `apps/api` would have written it.
async fn seed_token_row(app: &TestApp, id: &str, user_id: &str, token_hash: &str, scope: &str) {
    sqlx::query(
        r#"INSERT INTO "ApiToken" ("id", "userId", "name", "tokenHash", "scope", "createdAt")
           VALUES ($1, $2, 'seeded', $3, $4, $5)"#,
    )
    .bind(id)
    .bind(user_id)
    .bind(token_hash)
    .bind(scope)
    .bind(now())
    .execute(app.db.pool())
    .await
    .unwrap();
}

#[tokio::test]
async fn creates_a_token_returning_the_raw_secret_once_and_storing_only_its_hash() {
    let (app, token) = app_with_owner().await;

    let created = create(&app, &token, "CI", None).await;

    let raw = created["token"].as_str().unwrap();
    let body = raw.strip_prefix("trakwyn_").expect("the trakwyn_ prefix");
    assert_eq!(body.len(), 48, "24 random bytes in hex");
    assert!(body.bytes().all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f')));
    assert_eq!(created["name"], "CI");
    assert_eq!(created["scope"], "full");
    assert_eq!(created["id"].as_str().unwrap().len(), 21);

    let (stored_hash, scope): (String, String) =
        sqlx::query_as(r#"SELECT "tokenHash", "scope" FROM "ApiToken" WHERE "id" = $1"#)
            .bind(created["id"].as_str().unwrap())
            .fetch_one(app.db.pool())
            .await
            .unwrap();
    assert_eq!(stored_hash, hex::encode(Sha256::digest(raw.as_bytes())));
    assert_eq!(scope, "full");

    // The list never carries the secret: the type has no such field.
    let listed = app.graphql(LIST, json!({}), Auth::Bearer(&token)).await;
    let listed = listed.data("apiTokens");
    assert_eq!(listed[0]["id"], created["id"]);
    assert_eq!(listed[0]["lastUsedAt"], Value::Null);
    assert!(!listed.to_string().contains(body));
}

#[tokio::test]
async fn a_chosen_scope_is_stored_and_two_tokens_differ() {
    let (app, token) = app_with_owner().await;

    let read = create(&app, &token, "reader", Some("read")).await;
    let full = create(&app, &token, "writer", Some("full")).await;

    assert_eq!(read["scope"], "read");
    assert_eq!(full["scope"], "full");
    assert_ne!(read["token"], full["token"]);
}

#[tokio::test]
async fn an_unknown_scope_is_refused_by_the_schema() {
    let (app, token) = app_with_owner().await;

    let response =
        app.graphql(CREATE, json!({ "name": "x", "scope": "admin" }), Auth::Bearer(&token)).await;

    assert!(response.body["errors"].is_array(), "{}", response.body);
    assert_eq!(count(&app).await, 0);
}

#[tokio::test]
async fn lists_only_the_users_tokens_newest_first() {
    let (app, token) = app_with_owner().await;
    seed_user(&app.db, "stranger").await;
    let stranger = app.access_token("stranger");
    create(&app, &token, "first", None).await;
    tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    create(&app, &token, "second", Some("read")).await;
    create(&app, &stranger, "foreign", None).await;

    let response = app.graphql(LIST, json!({}), Auth::Bearer(&token)).await;

    let names: Vec<&str> = response
        .data("apiTokens")
        .as_array()
        .unwrap()
        .iter()
        .map(|token| token["name"].as_str().unwrap())
        .collect();
    assert_eq!(names, vec!["second", "first"]);
}

#[tokio::test]
async fn deletes_a_token_which_then_stops_authenticating() {
    let (app, token) = app_with_owner().await;
    let created = create(&app, &token, "CI", None).await;
    let raw = created["token"].as_str().unwrap();
    assert!(app.graphql(LIST, json!({}), Auth::Bearer(raw)).await.body.get("errors").is_none());

    let deleted = app.graphql(DELETE, json!({ "id": created["id"] }), Auth::Bearer(&token)).await;
    assert_eq!(deleted.data("deleteApiToken"), &Value::Bool(true));

    assert_eq!(app.graphql(LIST, json!({}), Auth::Bearer(raw)).await.error_code(), "UNAUTHORIZED");
    let again = app.graphql(DELETE, json!({ "id": created["id"] }), Auth::Bearer(&token)).await;
    assert_eq!(again.error_code(), "NOT_FOUND");
    assert_eq!(again.error_message(), "API token not found");
}

#[tokio::test]
async fn someone_elses_token_is_not_found_and_kept() {
    let (app, token) = app_with_owner().await;
    seed_user(&app.db, "stranger").await;
    let stranger = app.access_token("stranger");
    let created = create(&app, &token, "CI", None).await;

    let response =
        app.graphql(DELETE, json!({ "id": created["id"] }), Auth::Bearer(&stranger)).await;

    assert_eq!(response.error_code(), "NOT_FOUND");
    assert_eq!(response.error_message(), "API token not found");
    assert_eq!(response.body["errors"][0]["extensions"]["statusCode"], 404);
    assert_eq!(count(&app).await, 1);
}

#[tokio::test]
async fn every_operation_needs_a_signed_in_user() {
    let (app, _token) = app_with_owner().await;
    let requests =
        [(LIST, json!({})), (CREATE, json!({ "name": "x" })), (DELETE, json!({ "id": "x" }))];

    for (query, variables) in requests {
        let response = app.graphql(query, variables, Auth::None).await;
        assert_eq!(response.error_code(), "UNAUTHORIZED", "{query}");
    }
    assert_eq!(count(&app).await, 0);
}

mod authentication {
    use super::*;

    #[tokio::test]
    async fn a_full_token_authenticates_over_bearer_and_records_its_use() {
        let (app, token) = app_with_owner().await;
        let created = create(&app, &token, "CI", Some("full")).await;
        let raw = created["token"].as_str().unwrap();

        // Acts as its owner: it can list, and mint, that user's tokens.
        let listed = app.graphql(LIST, json!({}), Auth::Bearer(raw)).await;
        assert_eq!(listed.data("apiTokens")[0]["id"], created["id"]);
        assert!(listed.data("apiTokens")[0]["lastUsedAt"].is_string());

        let minted = create(&app, raw, "minted by a token", None).await;
        let owner: String =
            sqlx::query_scalar(r#"SELECT "userId" FROM "ApiToken" WHERE "id" = $1"#)
                .bind(minted["id"].as_str().unwrap())
                .fetch_one(app.db.pool())
                .await
                .unwrap();
        assert_eq!(owner, "owner");
    }

    #[tokio::test]
    async fn a_read_token_does_not_authenticate_graphql() {
        let (app, token) = app_with_owner().await;
        let created = create(&app, &token, "reader", Some("read")).await;
        let raw = created["token"].as_str().unwrap();

        let response = app.graphql(LIST, json!({}), Auth::Bearer(raw)).await;

        assert_eq!(response.status, 200);
        assert_eq!(response.error_code(), "UNAUTHORIZED");
        assert_eq!(response.body["data"]["apiTokens"], Value::Null);
    }

    #[tokio::test]
    async fn an_unknown_or_malformed_token_is_unauthorized() {
        let (app, _token) = app_with_owner().await;

        for raw in ["trakwyn_", "trakwyn_ffffffffffffffffffffffffffffffffffffffffffffffff"] {
            let response = app.graphql(LIST, json!({}), Auth::Bearer(raw)).await;
            assert_eq!(response.error_code(), "UNAUTHORIZED", "{raw}");
        }
    }

    #[tokio::test]
    async fn a_token_minted_and_hashed_by_apps_api_authenticates_here() {
        let (app, _token) = app_with_owner().await;
        seed_token_row(&app, "from-node", "owner", NODE_TOKEN_HASH, "full").await;

        let response = app.graphql(LIST, json!({}), Auth::Bearer(NODE_RAW_TOKEN)).await;

        let listed = response.data("apiTokens");
        assert_eq!(listed[0]["id"], "from-node");
        assert!(listed[0]["lastUsedAt"].is_string());
    }

    #[tokio::test]
    async fn a_read_token_minted_by_apps_api_is_refused_here_too() {
        let (app, _token) = app_with_owner().await;
        seed_token_row(&app, "from-node", "owner", NODE_TOKEN_HASH, "read").await;

        let response = app.graphql(LIST, json!({}), Auth::Bearer(NODE_RAW_TOKEN)).await;

        assert_eq!(response.error_code(), "UNAUTHORIZED");
    }

    #[tokio::test]
    async fn the_token_also_authenticates_from_the_access_cookie() {
        let (app, token) = app_with_owner().await;
        let created = create(&app, &token, "CI", None).await;
        let raw = created["token"].as_str().unwrap();

        let response = app.graphql(LIST, json!({}), Auth::Cookie(raw)).await;

        assert_eq!(response.data("apiTokens").as_array().unwrap().len(), 1);
    }
}
