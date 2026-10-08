//! The MCP endpoint end to end: Bearer authentication, the 401 challenge,
//! scope enforcement (the refusal is the security boundary), ownership
//! scoping and the write tools against a real database.

use axum::body::Body;
use axum::http::header::{ALLOW, AUTHORIZATION, CONTENT_TYPE, WWW_AUTHENTICATE};
use axum::http::{Request, StatusCode};
use serde_json::{json, Value};

use crate::common::{seed_application, seed_user, Auth, Response, TestApp};

const CREATE_TOKEN: &str = "mutation($name: String!, $scope: ApiTokenScope) {
    createApiToken(name: $name, scope: $scope) { token }
}";

async fn app() -> (TestApp, String) {
    let app = TestApp::start().await;
    seed_user(&app.db, "owner").await;
    seed_application(&app.db, "app-1", "owner").await;
    let jwt = app.access_token("owner");
    (app, jwt)
}

async fn api_token(app: &TestApp, jwt: &str, scope: &str) -> String {
    let response = app
        .graphql(CREATE_TOKEN, json!({ "name": scope, "scope": scope }), Auth::Bearer(jwt))
        .await;
    response.data("createApiToken")["token"].as_str().unwrap().to_string()
}

fn post(token: Option<&str>, body: &Value) -> Request<Body> {
    let mut request = Request::post("/mcp").header(CONTENT_TYPE, "application/json");
    if let Some(token) = token {
        request = request.header(AUTHORIZATION, format!("Bearer {token}"));
    }
    request.body(Body::from(body.to_string())).unwrap()
}

fn rpc(method: &str, params: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params })
}

fn tool_call(name: &str, arguments: Value) -> Value {
    rpc("tools/call", json!({ "name": name, "arguments": arguments }))
}

async fn send(app: &TestApp, token: &str, body: Value) -> Response {
    app.send(post(Some(token), &body)).await
}

fn result_text(response: &Response) -> Value {
    let text = response.body["result"]["content"][0]["text"]
        .as_str()
        .unwrap_or_else(|| panic!("expected a result: {}", response.body));
    serde_json::from_str(text).unwrap()
}

fn tool_names(response: &Response) -> Vec<String> {
    response.body["result"]["tools"]
        .as_array()
        .unwrap()
        .iter()
        .map(|tool| tool["name"].as_str().unwrap().to_string())
        .collect()
}

#[tokio::test]
async fn a_request_without_a_bearer_token_gets_the_discovery_challenge() {
    let (app, _) = app().await;
    let response = app.send(post(None, &rpc("tools/list", json!({})))).await;
    assert_eq!(response.status, StatusCode::UNAUTHORIZED);
    assert_eq!(response.body, json!({ "error": "Missing Authorization header" }));
    let challenge = response.headers[WWW_AUTHENTICATE].to_str().unwrap();
    assert!(
        challenge.starts_with("Bearer resource_metadata=\"")
            && challenge.ends_with("/.well-known/oauth-protected-resource\""),
        "{challenge}"
    );
}

#[tokio::test]
async fn an_invalid_token_is_challenged_too() {
    let (app, _) = app().await;
    let response =
        app.send(post(Some("trakwyn_not-a-real-token"), &rpc("tools/list", json!({})))).await;
    assert_eq!(response.status, StatusCode::UNAUTHORIZED);
    assert_eq!(response.body, json!({ "error": "Invalid or expired API token" }));
    assert!(response.headers.contains_key(WWW_AUTHENTICATE));
}

#[tokio::test]
async fn a_session_jwt_is_not_an_mcp_credential() {
    let (app, jwt) = app().await;
    let response = send(&app, &jwt, rpc("tools/list", json!({}))).await;
    assert_eq!(response.status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn get_and_delete_answer_405_with_an_allow_header() {
    let (app, _) = app().await;
    for method in ["GET", "DELETE"] {
        let request = Request::builder().method(method).uri("/mcp").body(Body::empty()).unwrap();
        let response = app.send(request).await;
        assert_eq!(response.status, StatusCode::METHOD_NOT_ALLOWED, "{method}");
        assert_eq!(response.headers[ALLOW], "POST");
        assert_eq!(response.body, json!({ "error": "Only POST is supported on this endpoint" }));
    }
}

#[tokio::test]
async fn a_body_that_is_not_json_is_a_400() {
    let (app, jwt) = app().await;
    let token = api_token(&app, &jwt, "full").await;
    let request = Request::post("/mcp")
        .header(CONTENT_TYPE, "application/json")
        .header(AUTHORIZATION, format!("Bearer {token}"))
        .body(Body::from("{not json"))
        .unwrap();
    assert_eq!(app.send(request).await.status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn a_malformed_envelope_is_a_400_with_invalid_request() {
    let (app, jwt) = app().await;
    let token = api_token(&app, &jwt, "read").await;
    let response = send(&app, &token, json!({ "id": 3, "method": "tools/list" })).await;
    assert_eq!(response.status, StatusCode::BAD_REQUEST);
    assert_eq!(response.body["error"]["code"], -32600);
    assert_eq!(response.body["id"], 3);
}

#[tokio::test]
async fn initialize_describes_the_server() {
    let (app, jwt) = app().await;
    let token = api_token(&app, &jwt, "read").await;
    let response = send(&app, &token, rpc("initialize", json!({}))).await;
    assert_eq!(response.status, StatusCode::OK);
    assert_eq!(response.body["result"]["protocolVersion"], "2024-11-05");
    assert_eq!(response.body["result"]["serverInfo"]["name"], "trakwyn-mcp");
}

#[tokio::test]
async fn tools_list_hides_write_tools_from_a_read_token() {
    let (app, jwt) = app().await;
    let read = api_token(&app, &jwt, "read").await;
    let full = api_token(&app, &jwt, "full").await;

    let read_tools = tool_names(&send(&app, &read, rpc("tools/list", json!({}))).await);
    let full_tools = tool_names(&send(&app, &full, rpc("tools/list", json!({}))).await);
    assert_eq!(read_tools.len(), 13);
    assert_eq!(full_tools.len(), 23);
    assert!(read_tools
        .iter()
        .all(|name| !name.starts_with("create_") && !name.starts_with("update_")));
}

#[tokio::test]
async fn a_read_token_cannot_call_a_write_tool_even_though_it_is_hidden() {
    let (app, jwt) = app().await;
    let token = api_token(&app, &jwt, "read").await;
    let response = send(
        &app,
        &token,
        tool_call("create_note", json!({ "applicationId": "app-1", "content": "x" })),
    )
    .await;
    assert_eq!(response.status, StatusCode::OK);
    assert_eq!(response.body["error"]["code"], -32602);
    assert_eq!(
        response.body["error"]["message"],
        "Tool \"create_note\" requires a full-access API token; this token is read-only"
    );
    let notes: i64 = sqlx::query_scalar(r#"SELECT count(*) FROM "Note""#)
        .fetch_one(app.db.pool())
        .await
        .unwrap();
    assert_eq!(notes, 0);
}

#[tokio::test]
async fn a_full_token_writes_and_the_data_is_the_callers() {
    let (app, jwt) = app().await;
    let token = api_token(&app, &jwt, "full").await;

    let created = send(
        &app,
        &token,
        tool_call("create_application", json!({ "company": "Globex", "role": "Staff" })),
    )
    .await;
    let application = result_text(&created);
    assert_eq!(application["userId"], "owner");
    assert_eq!(application["status"], "draft");

    let note = send(
        &app,
        &token,
        tool_call("create_note", json!({ "applicationId": "app-1", "content": "hello" })),
    )
    .await;
    assert_eq!(result_text(&note)["content"], "hello");
    let listed =
        send(&app, &token, tool_call("list_notes", json!({ "applicationId": "app-1" }))).await;
    assert_eq!(result_text(&listed).as_array().unwrap().len(), 1);

    let skill = send(&app, &token, tool_call("create_skill", json!({ "name": "Rust" }))).await;
    let id = result_text(&skill)["id"].as_str().unwrap().to_string();
    let updated = send(
        &app,
        &token,
        tool_call("update_skill", json!({ "skillId": id, "category": "Languages" })),
    )
    .await;
    assert_eq!(result_text(&updated)["category"], "Languages");

    let work = send(
        &app,
        &token,
        tool_call(
            "create_work_experience",
            json!({ "company": "Acme", "title": "Eng", "startDate": "2020-01-15" }),
        ),
    )
    .await;
    assert_eq!(result_text(&work)["startDate"], "2020-01-15T00:00:00.000Z");
}

#[tokio::test]
async fn tools_only_ever_see_the_callers_records() {
    let (app, jwt) = app().await;
    seed_user(&app.db, "stranger").await;
    seed_application(&app.db, "theirs", "stranger").await;
    let token = api_token(&app, &jwt, "full").await;

    let page = result_text(&send(&app, &token, tool_call("list_applications", json!({}))).await);
    let ids: Vec<&str> =
        page["items"].as_array().unwrap().iter().map(|i| i["id"].as_str().unwrap()).collect();
    assert_eq!(ids, ["app-1"]);

    let read =
        send(&app, &token, tool_call("get_application", json!({ "applicationId": "theirs" })))
            .await;
    assert!(read.body["error"].is_object(), "{}", read.body);
    assert_eq!(read.body["error"]["code"], -32602);

    let write = send(
        &app,
        &token,
        tool_call("create_note", json!({ "applicationId": "theirs", "content": "x" })),
    )
    .await;
    assert_eq!(write.body["error"]["code"], -32602);
    let notes: i64 = sqlx::query_scalar(r#"SELECT count(*) FROM "Note""#)
        .fetch_one(app.db.pool())
        .await
        .unwrap();
    assert_eq!(notes, 0);
}

#[tokio::test]
async fn list_applications_paginates_with_a_cursor() {
    let (app, jwt) = app().await;
    for id in ["app-2", "app-3"] {
        seed_application(&app.db, id, "owner").await;
    }
    let token = api_token(&app, &jwt, "read").await;
    let first = result_text(
        &send(&app, &token, tool_call("list_applications", json!({ "limit": 2 }))).await,
    );
    assert_eq!(first["items"].as_array().unwrap().len(), 2);
    assert_eq!(first["hasNextPage"], true);
    let cursor = first["nextCursor"].as_str().unwrap();
    let second = result_text(
        &send(
            &app,
            &token,
            tool_call("list_applications", json!({ "limit": "2", "cursor": cursor })),
        )
        .await,
    )
    .clone();
    assert_eq!(second["items"].as_array().unwrap().len(), 1);
    assert_eq!(second["hasNextPage"], false);
}

#[tokio::test]
async fn every_catalogue_tool_is_handled_against_a_real_database() {
    let (app, jwt) = app().await;
    let token = api_token(&app, &jwt, "full").await;
    let listed = tool_names(&send(&app, &token, rpc("tools/list", json!({}))).await);
    for name in listed {
        let response =
            send(&app, &token, tool_call(&name, json!({ "applicationId": "app-1" }))).await;
        let message = response.body["error"]["message"].as_str().unwrap_or_default();
        assert!(!message.starts_with("Unknown tool"), "{name} is advertised but not handled");
    }
    let unknown = send(&app, &token, tool_call("nope", json!({}))).await;
    assert_eq!(unknown.body["error"]["code"], -32601);
}

#[tokio::test]
async fn read_tools_return_every_shape() {
    let (app, jwt) = app().await;
    let token = api_token(&app, &jwt, "read").await;
    for name in ["list_work_experiences", "list_educations", "list_skills", "list_calendar_events"]
    {
        let result = result_text(&send(&app, &token, tool_call(name, json!({}))).await);
        assert_eq!(result, json!([]), "{name}");
    }
    for name in [
        "list_notes",
        "list_contacts",
        "list_interview_rounds",
        "list_documents",
        "list_offers",
        "list_activity",
    ] {
        let result = result_text(
            &send(&app, &token, tool_call(name, json!({ "applicationId": "app-1" }))).await,
        );
        assert_eq!(result, json!([]), "{name}");
    }
    let analytics = result_text(&send(&app, &token, tool_call("get_analytics", json!({}))).await);
    for key in ["responseTime", "channels", "interviewRounds", "offers"] {
        assert!(analytics.get(key).is_some(), "{key}");
    }
}
