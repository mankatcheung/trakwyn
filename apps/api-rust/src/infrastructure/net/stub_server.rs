//! A local HTTP server for tests of the vendor clients: it records every
//! request it receives and answers from a script.

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::body::{to_bytes, Body};
use axum::extract::State;
use axum::http::{HeaderMap, Request, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Router;
use tokio::net::TcpListener;
use tokio::task::JoinHandle;

#[derive(Debug, Clone)]
pub struct RecordedRequest {
    pub method: String,
    pub path: String,
    pub query: Option<String>,
    pub headers: HeaderMap,
    pub body: Vec<u8>,
}

impl RecordedRequest {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers.get(name).and_then(|value| value.to_str().ok())
    }

    pub fn json(&self) -> serde_json::Value {
        serde_json::from_slice(&self.body).unwrap()
    }
}

#[derive(Debug, Clone)]
pub struct StubResponse {
    status: u16,
    body: String,
    delay: Duration,
}

impl StubResponse {
    pub fn new(status: u16, body: impl Into<String>) -> Self {
        Self { status, body: body.into(), delay: Duration::ZERO }
    }

    pub fn json(status: u16, body: serde_json::Value) -> Self {
        Self::new(status, body.to_string())
    }

    pub fn delayed(mut self, delay: Duration) -> Self {
        self.delay = delay;
        self
    }
}

#[derive(Clone)]
struct Script {
    requests: Arc<Mutex<Vec<RecordedRequest>>>,
    /// Answers in order; the last one repeats once the rest are used up.
    responses: Arc<Mutex<VecDeque<StubResponse>>>,
}

pub struct StubServer {
    /// `http://127.0.0.1:<port>`, with no trailing slash.
    pub base_url: String,
    requests: Arc<Mutex<Vec<RecordedRequest>>>,
    server: JoinHandle<()>,
}

impl StubServer {
    /// Serves on a free local port until dropped.
    pub async fn start(responses: Vec<StubResponse>) -> Self {
        assert!(!responses.is_empty(), "a stub server needs at least one response");
        let script = Script {
            requests: Arc::new(Mutex::new(Vec::new())),
            responses: Arc::new(Mutex::new(responses.into())),
        };
        let requests = script.requests.clone();

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base_url = format!("http://{}", listener.local_addr().unwrap());
        let app = Router::new().fallback(answer).with_state(script);
        let server = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });

        Self { base_url, requests, server }
    }

    pub async fn answering(status: u16, body: impl Into<String>) -> Self {
        Self::start(vec![StubResponse::new(status, body)]).await
    }

    pub fn requests(&self) -> Vec<RecordedRequest> {
        self.requests.lock().unwrap().clone()
    }

    /// The only request received; fails the test if there was not exactly one.
    pub fn single_request(&self) -> RecordedRequest {
        let requests = self.requests();
        assert_eq!(requests.len(), 1, "expected exactly one request, got {requests:?}");
        requests.into_iter().next().unwrap()
    }
}

impl Drop for StubServer {
    fn drop(&mut self) {
        self.server.abort();
    }
}

/// A `http://127.0.0.1:<port>` nothing is listening on.
pub async fn unreachable_base_url() -> String {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    format!("http://{}", listener.local_addr().unwrap())
}

async fn answer(State(script): State<Script>, request: Request<Body>) -> Response {
    let (parts, body) = request.into_parts();
    let body = to_bytes(body, usize::MAX).await.unwrap().to_vec();
    script.requests.lock().unwrap().push(RecordedRequest {
        method: parts.method.to_string(),
        path: parts.uri.path().to_string(),
        query: parts.uri.query().map(str::to_string),
        headers: parts.headers,
        body,
    });

    let response = {
        let mut responses = script.responses.lock().unwrap();
        if responses.len() > 1 {
            responses.pop_front().unwrap()
        } else {
            responses.front().cloned().unwrap()
        }
    };
    if !response.delay.is_zero() {
        tokio::time::sleep(response.delay).await;
    }
    (StatusCode::from_u16(response.status).unwrap(), response.body).into_response()
}
