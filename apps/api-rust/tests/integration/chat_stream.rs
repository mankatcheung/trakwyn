//! `POST /chat/stream` end to end. The model is a loopback stub standing in
//! for the user's own `custom` provider, streaming OpenAI-style SSE.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::body::{Body, Bytes};
use axum::extract::State;
use axum::http::header::{AUTHORIZATION, CONTENT_TYPE, COOKIE, ORIGIN};
use axum::http::{Request, StatusCode};
use axum::response::Response as AxumResponse;
use axum::routing::post;
use axum::Router;
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

use crate::common::{Auth, Response, TestApp};
use crate::llm_keys::{app_with_owner, serve, SAVE, STUB_KEY, STUB_MODEL, STUB_PATH};

/// How one stubbed model reply behaves.
enum Reply {
    /// A complete SSE body.
    Body(String),
    /// One text delta, then silence until the connection is dropped.
    Hang,
}

#[derive(Default)]
struct StubState {
    replies: Mutex<VecDeque<Reply>>,
    requests: Mutex<Vec<Value>>,
    connection_dropped: AtomicBool,
}

struct DropFlag(Arc<StubState>);

impl Drop for DropFlag {
    fn drop(&mut self) {
        self.0.connection_dropped.store(true, Ordering::SeqCst);
    }
}

pub struct StreamStub {
    pub url: String,
    state: Arc<StubState>,
}

fn sse(chunks: &[Value]) -> String {
    let mut body: String = chunks.iter().map(|chunk| format!("data: {chunk}\n\n")).collect();
    body.push_str("data: [DONE]\n\n");
    body
}

pub fn text_reply(deltas: &[&str]) -> String {
    let mut chunks: Vec<Value> = deltas
        .iter()
        .map(|text| json!({ "choices": [{ "delta": { "content": text } }] }))
        .collect();
    chunks.push(json!({ "choices": [{ "delta": {}, "finish_reason": "stop" }] }));
    sse(&chunks)
}

pub fn tool_reply(id: &str, name: &str, arguments: &str) -> String {
    sse(&[
        json!({ "choices": [{ "delta": { "tool_calls": [{
            "index": 0, "id": id, "function": { "name": name, "arguments": arguments }
        }] } }] }),
        json!({ "choices": [{ "delta": {}, "finish_reason": "tool_calls" }] }),
    ])
}

async fn stub_handler(State(state): State<Arc<StubState>>, body: Bytes) -> AxumResponse {
    state.requests.lock().unwrap().push(serde_json::from_slice(&body).unwrap_or(Value::Null));
    let reply = state.replies.lock().unwrap().pop_front();
    let stream_body = match reply {
        Some(Reply::Body(text)) => Body::from(text),
        Some(Reply::Hang) => {
            let guard = DropFlag(state.clone());
            let first = format!(
                "data: {}\n\n",
                json!({ "choices": [{ "delta": { "content": "partial" } }] })
            );
            Body::from_stream(async_stream::stream! {
                let _guard = guard;
                yield Ok::<Bytes, std::convert::Infallible>(Bytes::from(first));
                std::future::pending::<()>().await;
            })
        }
        None => Body::from(text_reply(&["ok"])),
    };
    let mut response = AxumResponse::new(stream_body);
    response.headers_mut().insert(CONTENT_TYPE, "text/event-stream".parse().unwrap());
    response
}

impl StreamStub {
    async fn start(replies: Vec<Reply>) -> Self {
        let state =
            Arc::new(StubState { replies: Mutex::new(replies.into()), ..StubState::default() });
        let router = Router::new().route(STUB_PATH, post(stub_handler)).with_state(state.clone());
        Self { url: serve(router).await + STUB_PATH, state }
    }

    fn requests(&self) -> Vec<Value> {
        self.state.requests.lock().unwrap().clone()
    }
}

async fn save_key(app: &TestApp, token: &str, stub: &StreamStub) {
    let variables = json!({ "provider": "custom", "apiKey": STUB_KEY, "model": STUB_MODEL, "baseUrl": stub.url });
    let response = app.graphql(SAVE, variables, Auth::Bearer(token)).await;
    assert_eq!(response.data("saveLlmApiKey"), &Value::Bool(true));
}

async fn app_with_model(replies: Vec<Reply>) -> (TestApp, String, StreamStub) {
    let (app, token) = app_with_owner().await;
    let stub = StreamStub::start(replies).await;
    save_key(&app, &token, &stub).await;
    (app, token, stub)
}

async fn new_conversation(app: &TestApp, token: &str) -> String {
    let response =
        app.graphql("mutation { createConversation { id } }", json!({}), Auth::Bearer(token)).await;
    response.data("createConversation")["id"].as_str().unwrap().to_string()
}

fn chat_request(token: Option<&str>, body: &Value) -> Request<Body> {
    let mut request = Request::post("/chat/stream").header(CONTENT_TYPE, "application/json");
    if let Some(token) = token {
        request = request.header(AUTHORIZATION, format!("Bearer {token}"));
    }
    request.body(Body::from(body.to_string())).unwrap()
}

/// The `(event, data)` frames of an SSE body.
fn frames(response: &Response) -> Vec<(String, Value)> {
    let text = response.body.as_str().unwrap_or_else(|| panic!("not a stream: {}", response.body));
    text.split("\n\n")
        .filter(|frame| !frame.is_empty())
        .map(|frame| {
            let (event, data) = frame.split_once('\n').expect("event and data lines");
            (
                event.strip_prefix("event: ").expect("event line").to_string(),
                serde_json::from_str(data.strip_prefix("data: ").expect("data line")).unwrap(),
            )
        })
        .collect()
}

async fn history(app: &TestApp, token: &str, conversation_id: &str) -> Vec<Value> {
    let response = app
        .graphql(
            "query($id: ID!) { chatHistory(conversationId: $id) { id role content createdAt } }",
            json!({ "id": conversation_id }),
            Auth::Bearer(token),
        )
        .await;
    response.data("chatHistory").as_array().unwrap().clone()
}

#[tokio::test]
async fn streams_deltas_then_done_in_the_wire_format_the_clients_parse() {
    let (app, token, stub) = app_with_model(vec![Reply::Body(text_reply(&["Hel", "lo"]))]).await;
    let id = new_conversation(&app, &token).await;

    let response = app
        .send(chat_request(Some(&token), &json!({ "conversationId": id, "message": "Hi" })))
        .await;

    assert_eq!(response.status, StatusCode::OK);
    assert_eq!(response.headers[CONTENT_TYPE], "text/event-stream");
    assert_eq!(response.headers["cache-control"], "no-cache");
    assert_eq!(response.headers["x-accel-buffering"], "no");
    assert_eq!(
        response.body.as_str().unwrap(),
        "event: delta\ndata: {\"text\":\"Hel\"}\n\nevent: delta\ndata: {\"text\":\"lo\"}\n\nevent: done\ndata: {}\n\n"
    );

    let request = &stub.requests()[0];
    assert_eq!(request["messages"][0]["role"], "system");
    assert_eq!(request["messages"].as_array().unwrap().last().unwrap()["content"], "Hi");

    let stored = history(&app, &token, &id).await;
    let turns: Vec<(&str, &str)> = stored
        .iter()
        .map(|m| (m["role"].as_str().unwrap(), m["content"].as_str().unwrap()))
        .collect();
    assert_eq!(turns, [("user", "Hi"), ("assistant", "Hello")]);

    let listed = app.graphql("{ conversations { title } }", json!({}), Auth::Bearer(&token)).await;
    assert_eq!(listed.data("conversations")[0]["title"], "Hi");
}

#[tokio::test]
async fn offers_the_model_read_tools_only_and_runs_a_tool_round_trip() {
    let replies = vec![
        Reply::Body(tool_reply("call-1", "list_applications", "{}")),
        Reply::Body(text_reply(&["You have one application."])),
    ];
    let (app, token, stub) = app_with_model(replies).await;
    let id = new_conversation(&app, &token).await;

    let response = app
        .send(chat_request(
            Some(&token),
            &json!({ "conversationId": id, "message": "What do I have?" }),
        ))
        .await;

    assert_eq!(
        frames(&response).into_iter().map(|(event, _)| event).collect::<Vec<_>>(),
        ["delta", "done"]
    );
    let requests = stub.requests();
    let tools: Vec<&str> = requests[0]["tools"]
        .as_array()
        .unwrap()
        .iter()
        .map(|tool| tool["function"]["name"].as_str().unwrap())
        .collect();
    assert_eq!(tools.len(), 13);
    assert!(tools.iter().all(|name| name.starts_with("list_") || name.starts_with("get_")));

    let last = requests[1]["messages"].as_array().unwrap().last().unwrap().clone();
    assert_eq!(last["role"], "tool");
    let content = last["content"].as_str().unwrap();
    assert!(content.starts_with("<tool_result name=\"list_applications\">\n"), "{content}");
    assert!(content.contains("\"company\":\"Acme\""), "{content}");
    assert!(!content.contains("\"userId\""), "projected rows carry no workflow columns");

    let stored = history(&app, &token, &id).await;
    assert_eq!(stored[1]["content"], "You have one application.");
    let trace: Option<String> =
        sqlx::query_scalar(r#"SELECT "toolTrace" FROM "Message" WHERE "role" = 'assistant'"#)
            .fetch_one(app.db.pool())
            .await
            .unwrap();
    assert_eq!(trace.as_deref(), Some("list_applications → 1 result: app-1 Acme/Engineer"));
}

#[tokio::test]
async fn a_request_without_credentials_is_a_401() {
    let (app, _, _) = app_with_model(vec![]).await;
    let response =
        app.send(chat_request(None, &json!({ "conversationId": "c", "message": "hi" }))).await;
    assert_eq!(response.status, StatusCode::UNAUTHORIZED);
    assert_eq!(response.body, json!({ "error": "Unauthorized" }));
}

#[tokio::test]
async fn the_access_cookie_authenticates_like_graphql() {
    let (app, token, _) = app_with_model(vec![]).await;
    let id = new_conversation(&app, &token).await;
    let request = Request::post("/chat/stream")
        .header(CONTENT_TYPE, "application/json")
        .header(COOKIE, format!("trakwyn_access_token={token}"))
        .body(Body::from(json!({ "conversationId": id, "message": "hi" }).to_string()))
        .unwrap();
    let response = app.send(request).await;
    assert_eq!(response.status, StatusCode::OK);
    assert_eq!(frames(&response).last().unwrap().0, "done");
}

#[tokio::test]
async fn a_bad_body_is_an_ordinary_400_not_an_sse_frame() {
    let (app, token, _) = app_with_model(vec![]).await;
    let cases = [
        (json!({ "message": "hi" }), "conversationId and message are required"),
        (json!({ "conversationId": "c" }), "conversationId and message are required"),
        (
            json!({ "conversationId": "c", "message": "" }),
            "conversationId and message are required",
        ),
        (
            json!({ "conversationId": 7, "message": "hi" }),
            "conversationId and message are required",
        ),
        (
            json!({ "conversationId": "c", "message": "x".repeat(8001) }),
            "message must be at most 8000 characters",
        ),
    ];
    for (body, message) in cases {
        let response = app.send(chat_request(Some(&token), &body)).await;
        assert_eq!(response.status, StatusCode::BAD_REQUEST, "{body}");
        assert_eq!(response.body, json!({ "error": message }));
    }
    let not_json = Request::post("/chat/stream")
        .header(CONTENT_TYPE, "application/json")
        .header(AUTHORIZATION, format!("Bearer {token}"))
        .body(Body::from("{oops"))
        .unwrap();
    assert_eq!(app.send(not_json).await.status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn a_body_over_the_64_kb_limit_is_refused_before_it_is_parsed() {
    let (app, token, _) = app_with_model(vec![]).await;
    let body = json!({ "conversationId": "c", "message": "x".repeat(70 * 1024) });
    let response = app.send(chat_request(Some(&token), &body)).await;
    assert_eq!(response.status, StatusCode::PAYLOAD_TOO_LARGE);
}

#[tokio::test]
async fn failures_after_the_stream_starts_arrive_as_a_terminal_error_frame() {
    let (app, token) = app_with_owner().await;
    let id = new_conversation(&app, &token).await;

    // No key saved.
    let response = app
        .send(chat_request(Some(&token), &json!({ "conversationId": id, "message": "hi" })))
        .await;
    assert_eq!(response.status, StatusCode::OK);
    assert_eq!(
        frames(&response),
        [(
            "error".to_string(),
            json!({ "code": "AI_NOT_CONFIGURED", "message": "Add your AI API key in Settings to use this feature" })
        )]
    );

    let missing = app
        .send(chat_request(Some(&token), &json!({ "conversationId": "nope", "message": "hi" })))
        .await;
    assert_eq!(frames(&missing)[0].1["code"], "NOT_FOUND");
}

#[tokio::test]
async fn another_users_conversation_is_forbidden() {
    let (app, token, _) = app_with_model(vec![]).await;
    crate::common::seed_user(&app.db, "stranger").await;
    let theirs = new_conversation(&app, &app.access_token("stranger")).await;
    let response = app
        .send(chat_request(Some(&token), &json!({ "conversationId": theirs, "message": "hi" })))
        .await;
    assert_eq!(frames(&response)[0].1["code"], "FORBIDDEN");
}

#[tokio::test]
async fn a_provider_error_reaches_the_client_as_an_error_frame_and_nothing_is_stored() {
    let (app, token) = app_with_owner().await;
    // A stub that answers 401, like a rejected key.
    let router =
        Router::new().route(STUB_PATH, post(|| async { (StatusCode::UNAUTHORIZED, "bad key") }));
    let url = serve(router).await + STUB_PATH;
    let variables =
        json!({ "provider": "custom", "apiKey": STUB_KEY, "model": STUB_MODEL, "baseUrl": url });
    app.graphql(SAVE, variables, Auth::Bearer(&token)).await;
    let id = new_conversation(&app, &token).await;

    let response = app
        .send(chat_request(Some(&token), &json!({ "conversationId": id, "message": "hi" })))
        .await;
    let events = frames(&response);
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].0, "error");
    assert_eq!(events[0].1["code"], "AI_PROVIDER_ERROR");
    assert!(history(&app, &token, &id).await.is_empty());
}

#[tokio::test]
async fn hitting_the_rate_limit_ends_the_stream_with_a_rate_limited_error() {
    let (app, token, _) = app_with_model(vec![]).await;
    let id = new_conversation(&app, &token).await;
    let mut last = None;
    for _ in 0..21 {
        let response = app
            .send(chat_request(Some(&token), &json!({ "conversationId": id, "message": "hi" })))
            .await;
        last = Some(frames(&response));
    }
    let last = last.unwrap();
    assert_eq!(last[0].0, "error");
    assert_eq!(last[0].1["code"], "RATE_LIMITED");
}

#[tokio::test]
async fn the_response_is_readable_cross_origin() {
    let (app, token, _) = app_with_model(vec![]).await;
    let id = new_conversation(&app, &token).await;
    let origin = app.container.services.web_app_origin.clone();
    let request = Request::post("/chat/stream")
        .header(CONTENT_TYPE, "application/json")
        .header(AUTHORIZATION, format!("Bearer {token}"))
        .header(ORIGIN, "https://preview.vercel.app")
        .body(Body::from(json!({ "conversationId": id, "message": "hi" }).to_string()))
        .unwrap();
    let response = app.send(request).await;
    assert_eq!(response.headers["access-control-allow-origin"], "https://preview.vercel.app");
    assert_eq!(response.headers["access-control-allow-credentials"], "true");
    drop(origin);
}

#[tokio::test]
async fn a_client_disconnect_aborts_the_upstream_model_request() {
    let (app, token, stub) = app_with_model(vec![Reply::Hang]).await;
    let id = new_conversation(&app, &token).await;

    let response = app
        .router
        .clone()
        .oneshot(chat_request(Some(&token), &json!({ "conversationId": id, "message": "hi" })))
        .await
        .unwrap();
    let mut body = response.into_body();
    let first = body.frame().await.unwrap().unwrap().into_data().unwrap();
    assert!(String::from_utf8_lossy(&first).starts_with("event: delta"));

    drop(body);

    let mut aborted = false;
    for _ in 0..100 {
        if stub.state.connection_dropped.load(Ordering::SeqCst) {
            aborted = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    assert!(aborted, "the upstream request should have been dropped");
    assert!(history(&app, &token, &id).await.is_empty(), "an abandoned turn is not stored");
}
