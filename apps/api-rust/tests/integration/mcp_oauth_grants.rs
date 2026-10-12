//! `mcpOAuthGrants` and `revokeMcpOAuthGrant` through the GraphQL endpoint,
//! over grants created by the real OAuth flow.

use chrono::{TimeDelta, Utc};
use serde_json::{json, Value};

use trakwyn_api::domain::mcp_oauth::McpOAuthScope;
use trakwyn_api::use_cases::clock::now;
use trakwyn_api::use_cases::mcp_oauth::{
    CreateMcpOAuthAccessTokenInput, CreateMcpOAuthAuthorizationCodeInput,
    CreateMcpOAuthRefreshTokenInput, RegisterMcpOAuthClientInput,
};

use crate::common::{seed_user, Auth, TestApp};

const LIST: &str = "{ mcpOAuthGrants { id clientName scope authorizedAt lastUsedAt } }";
const REVOKE: &str = "mutation($id: ID!) { revokeMcpOAuthGrant(id: $id) }";

/// What a completed consent leaves behind: a client, a code and a live
/// refresh token, plus one access token. Returns `(grant id, access token)`.
async fn grant(app: &TestApp, user_id: &str, name: &str, scope: McpOAuthScope) -> (String, String) {
    let container = &app.container;
    let client = container
        .register_mcp_oauth_client_use_case()
        .execute(RegisterMcpOAuthClientInput {
            name: name.to_string(),
            redirect_uris: vec!["http://localhost:6274/cb".to_string()],
        })
        .await
        .unwrap();
    let code = container
        .create_mcp_oauth_authorization_code_use_case()
        .execute(CreateMcpOAuthAuthorizationCodeInput {
            client_id: client.id.clone(),
            user_id: user_id.to_string(),
            redirect_uri: "http://localhost:6274/cb".to_string(),
            scope,
            code_challenge: "challenge".to_string(),
        })
        .await
        .unwrap()
        .code;
    container
        .create_mcp_oauth_refresh_token_use_case()
        .execute(CreateMcpOAuthRefreshTokenInput {
            user_id: user_id.to_string(),
            client_id: client.id.clone(),
            family_id: code.family_id.clone(),
            scope,
        })
        .await
        .unwrap();
    let access = container
        .create_mcp_oauth_access_token_use_case()
        .execute(CreateMcpOAuthAccessTokenInput {
            user_id: user_id.to_string(),
            client_id: client.id,
            family_id: code.family_id.clone(),
            scope,
        })
        .await
        .unwrap();
    (code.family_id, access.raw_token)
}

async fn app_with_users() -> (TestApp, String, String) {
    let app = TestApp::start().await;
    seed_user(&app.db, "owner").await;
    seed_user(&app.db, "stranger").await;
    let owner = app.access_token("owner");
    let stranger = app.access_token("stranger");
    (app, owner, stranger)
}

async fn list(app: &TestApp, token: &str) -> Vec<Value> {
    app.graphql(LIST, json!({}), Auth::Cookie(token))
        .await
        .data("mcpOAuthGrants")
        .as_array()
        .unwrap()
        .clone()
}

#[tokio::test]
async fn lists_the_callers_grants_newest_first_without_the_client_id() {
    let (app, owner, stranger) = app_with_users().await;
    let (first, _) = grant(&app, "owner", "Claude Desktop", McpOAuthScope::Read).await;
    sqlx::query(r#"UPDATE "McpOAuthAuthorizationCode" SET "createdAt" = $1"#)
        .bind(now() - TimeDelta::hours(2))
        .execute(app.db.pool())
        .await
        .unwrap();
    let (second, _) = grant(&app, "owner", "Cursor", McpOAuthScope::Full).await;
    grant(&app, "stranger", "Not yours", McpOAuthScope::Read).await;

    let grants = list(&app, &owner).await;

    assert_eq!(grants.len(), 2);
    assert_eq!(grants[0]["id"], second);
    assert_eq!(grants[0]["clientName"], "Cursor");
    assert_eq!(grants[0]["scope"], "full");
    assert_eq!(grants[0]["lastUsedAt"], Value::Null);
    assert_eq!(grants[1]["id"], first);
    assert_eq!(grants[1]["scope"], "read");
    let authorized = grants[0]["authorizedAt"].as_str().unwrap();
    assert!(authorized.ends_with('Z') && authorized.len() == 24, "{authorized}");
    assert!(grants[0].get("clientId").is_none());
    assert_eq!(list(&app, &stranger).await.len(), 1);
}

#[tokio::test]
async fn reports_when_a_grant_was_last_used() {
    let (app, owner, _) = app_with_users().await;
    let (_, access) = grant(&app, "owner", "Claude", McpOAuthScope::Read).await;
    app.container.validate_mcp_oauth_access_token_use_case().execute(&access).await.unwrap();

    let grants = list(&app, &owner).await;

    let used = grants[0]["lastUsedAt"].as_str().unwrap();
    let parsed = chrono::DateTime::parse_from_rfc3339(used).unwrap();
    assert!(Utc::now().signed_duration_since(parsed) < TimeDelta::minutes(1));
}

#[tokio::test]
async fn revoking_a_grant_kills_the_client_and_removes_it_from_the_list() {
    let (app, owner, _) = app_with_users().await;
    let (id, access) = grant(&app, "owner", "Claude", McpOAuthScope::Read).await;
    let mcp = app.container.authenticate_mcp_request_use_case();
    assert!(mcp.execute(&access).await.is_some());

    let response = app.graphql(REVOKE, json!({ "id": id }), Auth::Cookie(&owner)).await;

    assert_eq!(response.data("revokeMcpOAuthGrant"), &json!(true));
    assert!(mcp.execute(&access).await.is_none());
    assert!(list(&app, &owner).await.is_empty());
    let events: i64 = sqlx::query_scalar(
        r#"SELECT count(*) FROM "SecurityEvent" WHERE "eventType" = 'mcp_oauth_token_revoked'"#,
    )
    .fetch_one(app.db.pool())
    .await
    .unwrap();
    assert_eq!(events, 1);

    let again = app.graphql(REVOKE, json!({ "id": id }), Auth::Cookie(&owner)).await;
    assert_eq!(again.data("revokeMcpOAuthGrant"), &json!(false));
}

#[tokio::test]
async fn refuses_to_revoke_another_users_grant_and_leaves_it_working() {
    let (app, owner, stranger) = app_with_users().await;
    let (id, access) = grant(&app, "owner", "Claude", McpOAuthScope::Read).await;

    let response = app.graphql(REVOKE, json!({ "id": id }), Auth::Cookie(&stranger)).await;

    assert_eq!(response.data("revokeMcpOAuthGrant"), &json!(false));
    assert!(app.container.authenticate_mcp_request_use_case().execute(&access).await.is_some());
    assert_eq!(list(&app, &owner).await.len(), 1);

    let unknown = app.graphql(REVOKE, json!({ "id": "nope" }), Auth::Cookie(&owner)).await;
    assert_eq!(unknown.data("revokeMcpOAuthGrant"), &json!(false));
}

#[tokio::test]
async fn a_grant_with_no_live_refresh_token_is_not_listed() {
    let (app, owner, _) = app_with_users().await;
    grant(&app, "owner", "Claude", McpOAuthScope::Read).await;
    sqlx::query(r#"UPDATE "McpOAuthRefreshToken" SET "expiresAt" = now() - interval '1 second'"#)
        .execute(app.db.pool())
        .await
        .unwrap();

    assert!(list(&app, &owner).await.is_empty());
}

#[tokio::test]
async fn both_operations_require_a_session() {
    let app = TestApp::start().await;

    let listed = app.graphql(LIST, json!({}), Auth::None).await;
    assert_eq!(listed.error_code(), "UNAUTHORIZED");
    let revoked = app.graphql(REVOKE, json!({ "id": "x" }), Auth::None).await;
    assert_eq!(revoked.error_code(), "UNAUTHORIZED");
}
