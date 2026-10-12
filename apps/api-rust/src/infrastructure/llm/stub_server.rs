//! A local HTTP server that plays a provider (or a job board) in tests: it
//! serves canned replies in order and records every request it received.
#![cfg(test)]

use std::collections::VecDeque;
use std::convert::Infallible;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::body::Body;
use futures::StreamExt;

use crate::infrastructure::llm::fetch_with_retry::LlmTransport;
use crate::use_cases::errors::DomainError;
use crate::use_cases::ports::llm_provider::{
    LlmCompletionResult, LlmStream, LlmStreamChunk, LlmToolCall, LlmUsage,
};
use axum::extract::{Request, State};
use axum::http::{HeaderMap, HeaderName, HeaderValue, StatusCode};
use axum::response::Response;
use axum::Router;
use serde_json::Value;

/// A transport whose retry backoff is short enough to run in real time.
pub fn fast_transport() -> LlmTransport {
    let mut transport = LlmTransport::new().unwrap();
    transport.retry_backoff_base = Duration::from_millis(40);
    transport
}

/// Every chunk of a stream, failing the test on an error item.
pub async fn chunks(stream: LlmStream) -> Vec<LlmStreamChunk> {
    stream.map(|item| item.expect("the stream should not fail")).collect().await
}

/// The error a stream ends with, failing the test if it has none.
pub async fn stream_error(stream: LlmStream) -> DomainError {
    let items: Vec<_> = stream.collect().await;
    items.into_iter().find_map(Result::err).expect("the stream should fail")
}

pub fn text_delta(text: &str) -> LlmStreamChunk {
    LlmStreamChunk::TextDelta { text: text.to_string() }
}

pub fn done(
    content: Option<&str>,
    tool_calls: Vec<LlmToolCall>,
    usage: Option<LlmUsage>,
) -> LlmStreamChunk {
    LlmStreamChunk::Done(LlmCompletionResult {
        content: content.map(str::to_string),
        tool_calls,
        usage,
    })
}

/// How long a test waits for the server to observe something.
const WAIT_LIMIT: Duration = Duration::from_secs(5);
const WAIT_STEP: Duration = Duration::from_millis(5);

#[derive(Debug, Clone)]
pub struct RecordedRequest {
    pub method: String,
    /// Path and query, as sent.
    pub uri: String,
    pub headers: HeaderMap,
    pub body: Vec<u8>,
}

impl RecordedRequest {
    pub fn json(&self) -> Value {
        serde_json::from_slice(&self.body).expect("the request body is JSON")
    }

    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers.get(name).and_then(|value| value.to_str().ok())
    }
}

#[derive(Debug, Clone)]
pub enum StubReply {
    Respond {
        status: u16,
        headers: Vec<(String, String)>,
        body: String,
    },
    /// A body sent in pieces, each after its delay. With `hang`, the body
    /// then stays open without sending anything more.
    Stream {
        chunks: Vec<(Duration, Vec<u8>)>,
        hang: bool,
    },
    /// Accepts the request and never answers.
    Hang,
}

impl StubReply {
    pub fn json(status: u16, body: Value) -> Self {
        Self::text(status, body.to_string()).with_header("content-type", "application/json")
    }

    pub fn text(status: u16, body: impl Into<String>) -> Self {
        Self::Respond { status, headers: Vec::new(), body: body.into() }
    }

    pub fn html(body: impl Into<String>) -> Self {
        Self::text(200, body).with_header("content-type", "text/html; charset=utf-8")
    }

    pub fn redirect(status: u16, location: &str) -> Self {
        Self::text(status, "").with_header("location", location)
    }

    /// An SSE body delivered in the given pieces, back to back.
    pub fn sse(chunks: &[&str]) -> Self {
        Self::sse_spaced(chunks, Duration::ZERO)
    }

    /// An SSE body whose pieces arrive `gap` apart.
    pub fn sse_spaced(chunks: &[&str], gap: Duration) -> Self {
        Self::Stream {
            chunks: chunks.iter().map(|chunk| (gap, chunk.as_bytes().to_vec())).collect(),
            hang: false,
        }
    }

    /// Sends the pieces, then keeps the body open and silent.
    pub fn sse_then_hang(chunks: &[&str]) -> Self {
        Self::Stream {
            chunks: chunks
                .iter()
                .map(|chunk| (Duration::ZERO, chunk.as_bytes().to_vec()))
                .collect(),
            hang: true,
        }
    }

    pub fn with_header(mut self, name: &str, value: &str) -> Self {
        if let Self::Respond { headers, .. } = &mut self {
            headers.push((name.to_string(), value.to_string()));
        }
        self
    }
}

#[derive(Default)]
struct Shared {
    replies: Mutex<VecDeque<StubReply>>,
    requests: Mutex<Vec<RecordedRequest>>,
    /// Hung replies the client walked away from.
    abandoned: AtomicUsize,
}

/// Counts a hung reply as abandoned when the server drops it, which it does
/// once the client has closed the connection.
struct AbandonGuard(Arc<Shared>);

impl Drop for AbandonGuard {
    fn drop(&mut self) {
        self.0.abandoned.fetch_add(1, Ordering::SeqCst);
    }
}

pub struct StubServer {
    addr: SocketAddr,
    shared: Arc<Shared>,
    task: tokio::task::JoinHandle<()>,
}

impl StubServer {
    /// Replies are served in order; the last one repeats for any further request.
    pub async fn start(replies: Vec<StubReply>) -> Self {
        let shared = Arc::new(Shared { replies: Mutex::new(replies.into()), ..Shared::default() });
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let router = Router::new().fallback(handle).with_state(shared.clone());
        let task = tokio::spawn(async move {
            axum::serve(listener, router).await.unwrap();
        });
        Self { addr, shared, task }
    }

    pub fn url(&self, path: &str) -> String {
        format!("http://{}{path}", self.addr)
    }

    pub fn requests(&self) -> Vec<RecordedRequest> {
        self.shared.requests.lock().unwrap().clone()
    }

    pub fn request_count(&self) -> usize {
        self.shared.requests.lock().unwrap().len()
    }

    /// The only request received, as JSON.
    pub fn only_request(&self) -> RecordedRequest {
        let requests = self.requests();
        assert_eq!(requests.len(), 1, "expected exactly one request");
        requests.into_iter().next().unwrap()
    }

    pub async fn wait_for_requests(&self, count: usize) {
        self.wait_until(|| self.request_count() >= count, "requests to arrive").await;
    }

    /// Waits until the client has dropped `count` hung replies.
    pub async fn wait_for_abandoned(&self, count: usize) {
        self.wait_until(
            || self.shared.abandoned.load(Ordering::SeqCst) >= count,
            "the client to close the connection",
        )
        .await;
    }

    async fn wait_until(&self, done: impl Fn() -> bool, what: &str) {
        let started = std::time::Instant::now();
        while !done() {
            assert!(started.elapsed() < WAIT_LIMIT, "timed out waiting for {what}");
            tokio::time::sleep(WAIT_STEP).await;
        }
    }
}

impl Drop for StubServer {
    fn drop(&mut self) {
        self.task.abort();
    }
}

async fn handle(State(shared): State<Arc<Shared>>, request: Request) -> Response {
    let (parts, body) = request.into_parts();
    let body = axum::body::to_bytes(body, usize::MAX).await.unwrap_or_default();
    let uri = parts.uri.path_and_query().map(|uri| uri.to_string()).unwrap_or_default();
    shared.requests.lock().unwrap().push(RecordedRequest {
        method: parts.method.to_string(),
        uri,
        headers: parts.headers,
        body: body.to_vec(),
    });

    let reply = {
        let mut replies = shared.replies.lock().unwrap();
        if replies.len() > 1 {
            replies.pop_front()
        } else {
            replies.front().cloned()
        }
    };

    match reply {
        None => respond(500, &[], "no reply scripted".to_string()),
        Some(StubReply::Respond { status, headers, body }) => respond(status, &headers, body),
        Some(StubReply::Hang) => {
            let _guard = AbandonGuard(shared);
            std::future::pending::<Response>().await
        }
        Some(StubReply::Stream { chunks, hang }) => {
            let body = async_stream::stream! {
                for (delay, chunk) in chunks {
                    if !delay.is_zero() {
                        tokio::time::sleep(delay).await;
                    }
                    yield Ok::<_, Infallible>(chunk);
                }
                if hang {
                    let _guard = AbandonGuard(shared);
                    std::future::pending::<()>().await;
                }
            };
            let mut response = Response::new(Body::from_stream(body));
            response
                .headers_mut()
                .insert("content-type", HeaderValue::from_static("text/event-stream"));
            response
        }
    }
}

fn respond(status: u16, headers: &[(String, String)], body: String) -> Response {
    let mut response = Response::new(Body::from(body));
    *response.status_mut() = StatusCode::from_u16(status).unwrap();
    for (name, value) in headers {
        response.headers_mut().insert(
            HeaderName::from_bytes(name.as_bytes()).unwrap(),
            HeaderValue::from_str(value).unwrap(),
        );
    }
    response
}
