//! MCP transport. Authenticates the Bearer credential via
//! `AuthenticateMcpRequestUseCase`, then hands the JSON-RPC body to the
//! `McpController`, which owns all protocol logic.
//!
//! POST is the only method that carries messages: there is no
//! server-initiated SSE stream and no session handling, so this is a subset
//! of MCP's Streamable HTTP transport. GET and DELETE are still answered —
//! with 405 and an `Allow` header — because the difference between "not
//! supported here" and "no such endpoint" is what lets a client keep going
//! instead of giving up on the server before it reaches the 401 that starts
//! OAuth discovery.

use std::sync::Arc;

use axum::body::Bytes;
use axum::extract::State;
use axum::http::header::{ALLOW, AUTHORIZATION, CONTENT_TYPE, WWW_AUTHENTICATE};
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, post};
use axum::Router;
use serde_json::{json, Value};

use super::mcp_oauth::protected_resource_metadata_url;
use crate::http::constants::{mcp_route, BEARER_PREFIX};
use crate::http::container::Container;

pub fn router<S: Clone + Send + Sync + 'static>(container: Arc<Container>) -> Router<S> {
    Router::new()
        .route(mcp_route::PATH, post(handle).merge(get(not_allowed)).merge(delete(not_allowed)))
        .with_state(container)
}

fn json_response(status: StatusCode, body: &Value) -> Response {
    let mut response = (status, body.to_string()).into_response();
    response.headers_mut().insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    response
}

fn challenge(container: &Container, headers: &HeaderMap, message: &str) -> Response {
    let url = protected_resource_metadata_url(container, headers);
    let mut response = json_response(StatusCode::UNAUTHORIZED, &json!({ "error": message }));
    if let Ok(value) = HeaderValue::from_str(&format!("Bearer resource_metadata=\"{url}\"")) {
        response.headers_mut().insert(WWW_AUTHENTICATE, value);
    }
    response
}

/// An empty body reads as no body at all; anything else must be JSON, as
/// Fastify's parser insists before the handler runs.
fn parse_body(bytes: &Bytes) -> Result<Value, Response> {
    if bytes.is_empty() {
        return Ok(Value::Null);
    }
    serde_json::from_slice(bytes).map_err(|_| {
        json_response(
            StatusCode::BAD_REQUEST,
            &json!({
                "statusCode": 400,
                "code": "FST_ERR_CTP_INVALID_JSON_BODY",
                "error": "Bad Request",
                "message": "Body is not valid JSON",
            }),
        )
    })
}

async fn handle(
    State(container): State<Arc<Container>>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let body = match parse_body(&body) {
        Ok(body) => body,
        Err(response) => return response,
    };

    let raw_token = headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix(BEARER_PREFIX))
        .filter(|token| !token.is_empty());
    let Some(raw_token) = raw_token else {
        return challenge(&container, &headers, "Missing Authorization header");
    };

    let Some(auth) = container.authenticate_mcp_request_use_case().execute(raw_token).await else {
        return challenge(&container, &headers, "Invalid or expired API token");
    };

    let result = container.mcp_controller().handle(&body, &auth.sub, auth.scope).await;
    json_response(StatusCode::from_u16(result.status).unwrap_or(StatusCode::OK), &result.body)
}

async fn not_allowed() -> Response {
    let mut response = json_response(
        StatusCode::METHOD_NOT_ALLOWED,
        &json!({ "error": "Only POST is supported on this endpoint" }),
    );
    response.headers_mut().insert(ALLOW, HeaderValue::from_static("POST"));
    response
}
