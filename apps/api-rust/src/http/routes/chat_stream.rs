//! Streams the assistant's chat reply (JEF-239): `POST /chat/stream`,
//! server-sent events written as the model produces them.
//!
//! Same cookie-or-Bearer auth as GraphQL. The events are the contract the
//! web and mobile clients parse:
//!
//! - `delta`    `{ "text": string }`
//! - `fallback` `{ "from": string, "to": string }` (before any text)
//! - `done`     `{}`, terminal on success
//! - `error`    `{ "code": string, "message": string }`, terminal on failure
//!
//! Dropping the response body (the client went away) drops the use-case
//! stream, which drops the upstream LLM request.

// A handler's early exit is the finished `Response`; it is built once per
// request, so its size does not matter.
#![allow(clippy::result_large_err)]

use std::convert::Infallible;
use std::net::SocketAddr;
use std::sync::Arc;

use async_stream::stream;
use axum::body::{Body, Bytes};
use axum::extract::{ConnectInfo, DefaultBodyLimit, State};
use axum::http::header::{CACHE_CONTROL, CONNECTION, CONTENT_TYPE};
use axum::http::{Extensions, HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use axum::Router;
use futures::StreamExt;
use serde_json::{json, Value};

use crate::http::constants::chat_stream;
use crate::http::container::Container;
use crate::http::request_context::RequestContext;
use crate::use_cases::chat::{ChatStreamEvent, ChatWithAssistantInput};
use crate::use_cases::constants::chat;
use crate::use_cases::errors::{DomainError, ErrorCode};
use crate::use_cases::shared::js_string::utf16_len;

const EVENT_STREAM: &str = "text/event-stream";
/// Disables response buffering on nginx-fronted deployments; without it a
/// reverse proxy can hold the whole stream until it closes.
const X_ACCEL_BUFFERING: &str = "x-accel-buffering";

pub fn router<S: Clone + Send + Sync + 'static>(container: Arc<Container>) -> Router<S> {
    Router::new()
        .route(chat_stream::PATH, post(handle))
        // A chat turn is one id and one message; refuse an over-long body
        // before it is parsed.
        .layer(DefaultBodyLimit::max(chat_stream::BODY_LIMIT_BYTES))
        .with_state(container)
}

fn json_error(status: StatusCode, body: &Value) -> Response {
    let mut response = (status, body.to_string()).into_response();
    response.headers_mut().insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    response
}

fn bad_request(message: &str) -> Response {
    json_error(StatusCode::BAD_REQUEST, &json!({ "error": message }))
}

struct ChatRequest {
    conversation_id: String,
    message: String,
}

/// The request body, checked before the response starts so a bad request
/// gets an ordinary 400 rather than an SSE `error` frame. The length cap
/// mirrors the use case's own check.
fn validate(body: &Value) -> Result<ChatRequest, Response> {
    let conversation_id = body.get("conversationId").and_then(Value::as_str);
    let message = body.get("message").and_then(Value::as_str);
    let too_long = message.is_some_and(|m| utf16_len(m) > chat::MAX_MESSAGE_CHARS);
    if too_long {
        return Err(bad_request(&format!(
            "message must be at most {} characters",
            chat::MAX_MESSAGE_CHARS
        )));
    }
    match (conversation_id, message) {
        (Some(id), Some(message)) if !id.is_empty() && !message.is_empty() => {
            Ok(ChatRequest { conversation_id: id.to_string(), message: message.to_string() })
        }
        _ => Err(bad_request("conversationId and message are required")),
    }
}

fn frame(event: &str, data: &Value) -> Bytes {
    Bytes::from(format!("event: {event}\ndata: {data}\n\n"))
}

fn error_frame(error: &DomainError) -> Bytes {
    let (code, message) = match error {
        DomainError::Coded { code, message, .. } => (code.as_str(), message.as_str()),
        DomainError::Internal(_) => (ErrorCode::InternalError.as_str(), "Something went wrong"),
    };
    frame("error", &json!({ "code": code, "message": message }))
}

fn event_frame(event: &ChatStreamEvent) -> Bytes {
    match event {
        ChatStreamEvent::Delta { text } => frame("delta", &json!({ "text": text })),
        ChatStreamEvent::Fallback { from, to } => {
            frame("fallback", &json!({ "from": from, "to": to }))
        }
        ChatStreamEvent::Done => frame("done", &json!({})),
    }
}

async fn handle(
    State(container): State<Arc<Container>>,
    headers: HeaderMap,
    extensions: Extensions,
    body: Bytes,
) -> Response {
    // Parsed before auth, as Fastify's body parser runs before the handler.
    let parsed: Value = if body.is_empty() {
        Value::Null
    } else {
        match serde_json::from_slice(&body) {
            Ok(value) => value,
            Err(_) => return bad_request("Body is not valid JSON"),
        }
    };

    let peer = extensions.get::<ConnectInfo<SocketAddr>>().map(|ConnectInfo(peer)| *peer);
    let context = RequestContext::from_request(&container, &headers, peer).await;
    let Some(user) = context.user else {
        return json_error(StatusCode::UNAUTHORIZED, &json!({ "error": "Unauthorized" }));
    };

    let request = match validate(&parsed) {
        Ok(request) => request,
        Err(response) => return response,
    };

    let mut events =
        container.stream_chat_with_assistant_use_case().execute(ChatWithAssistantInput {
            user_id: user.sub,
            conversation_id: request.conversation_id,
            message: request.message,
        });

    let frames = stream! {
        while let Some(item) = events.next().await {
            match item {
                Ok(event) => yield Ok::<Bytes, Infallible>(event_frame(&event)),
                Err(error) => {
                    yield Ok(error_frame(&error));
                    break;
                }
            }
        }
    };

    let mut response = Response::new(Body::from_stream(frames));
    let headers = response.headers_mut();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static(EVENT_STREAM));
    headers.insert(CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    headers.insert(CONNECTION, HeaderValue::from_static("keep-alive"));
    headers.insert(X_ACCEL_BUFFERING, HeaderValue::from_static("no"));
    response
}
