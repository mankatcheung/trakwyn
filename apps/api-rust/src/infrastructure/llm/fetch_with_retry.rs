//! The HTTP transport the provider adapters share: one connection pool, a
//! bounded retry for transient failures, a per-attempt timeout for one-shot
//! calls and an idle timeout for streamed ones.

use std::future::Future;
use std::time::Duration;

use chrono::{DateTime, Utc};
use reqwest::header::{HeaderMap, CONTENT_TYPE, RETRY_AFTER};
use serde_json::Value;
use tokio::time::Instant;

use crate::infrastructure::llm::provider_error::provider_http_error;
use crate::infrastructure::llm::sse_parser::{SseFrame, SseParser};
use crate::use_cases::constants::llm;
use crate::use_cases::errors::{DomainError, DomainResult};

const JSON_CONTENT_TYPE: &str = "application/json";

/// A provider call that failed below HTTP: the request never completed, the
/// stream went quiet, or a 2xx body was not the JSON it should have been.
/// Always wrapped in `DomainError::Internal`, so none of it reaches a client.
#[derive(Debug, thiserror::Error)]
pub enum LlmTransportError {
    /// The URL is stripped from the source: a custom base URL is user data.
    #[error("LLM provider request failed: {0}")]
    Request(#[source] reqwest::Error),
    #[error("LLM provider stream timed out waiting for data")]
    IdleTimeout,
    #[error("LLM provider returned a body that is not valid JSON: {0}")]
    InvalidBody(#[source] serde_json::Error),
}

fn request_failed(err: reqwest::Error) -> DomainError {
    DomainError::internal(LlmTransportError::Request(err.without_url()))
}

/// One JSON `POST` to a provider. `Content-Type: application/json` is added
/// by the transport; `headers` carries the credential.
#[derive(Debug, Clone)]
pub struct LlmRequest {
    pub url: String,
    pub headers: Vec<(&'static str, String)>,
    pub body: String,
}

/// Shared by every provider adapter. Cloning is cheap and keeps the same
/// connection pool. Redirects are never followed: a provider endpoint that
/// answers 3xx is a failed call, not a second destination to send the key to.
///
/// The tuning fields default to `constants::llm`; tests shorten them.
#[derive(Debug, Clone)]
pub struct LlmTransport {
    client: reqwest::Client,
    pub max_retries: u32,
    pub retry_backoff_base: Duration,
    pub retry_after_max: Duration,
    pub request_timeout: Duration,
    pub stream_idle_timeout: Duration,
}

impl LlmTransport {
    pub fn new() -> DomainResult<Self> {
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(DomainError::internal)?;
        Ok(Self {
            client,
            max_retries: llm::MAX_RETRIES,
            retry_backoff_base: Duration::from_millis(llm::RETRY_BACKOFF_BASE_MS),
            retry_after_max: Duration::from_millis(llm::RETRY_AFTER_MAX_MS),
            request_timeout: Duration::from_millis(llm::REQUEST_TIMEOUT_MS),
            stream_idle_timeout: Duration::from_millis(llm::STREAM_IDLE_TIMEOUT_MS),
        })
    }

    /// Sends the request with a small bounded retry for transient failures:
    /// network errors (including the per-attempt timeout) and 5xx responses.
    /// A 4xx (bad key, bad request) is returned at once, so it fails fast
    /// and surfaces clearly rather than being masked by a retry loop. The
    /// exception is a 429 that names a short `Retry-After`, which is waited
    /// out; a 503 with one waits that long instead of the backoff.
    ///
    /// `per_attempt_timeout` covers one attempt from connect to the end of
    /// its body. Streaming callers pass `None` and bound the call with an
    /// [`IdleDeadline`] instead: a fixed timeout would cut off a healthy
    /// stream that simply runs longer than one request should.
    ///
    /// Returns the final response, 2xx or not, or the final network error.
    /// Dropping the future abandons the attempt in flight and any retry.
    pub async fn fetch_with_retry(
        &self,
        request: &LlmRequest,
        per_attempt_timeout: Option<Duration>,
    ) -> Result<reqwest::Response, reqwest::Error> {
        let mut attempt = 0;
        loop {
            let mut delay = self.retry_backoff_base * 2u32.saturating_pow(attempt);
            let last_attempt = attempt == self.max_retries;

            let mut builder =
                self.client.post(&request.url).header(CONTENT_TYPE, JSON_CONTENT_TYPE);
            for (name, value) in &request.headers {
                builder = builder.header(*name, value);
            }
            if let Some(timeout) = per_attempt_timeout {
                builder = builder.timeout(timeout);
            }

            match builder.body(request.body.clone()).send().await {
                Ok(response) => {
                    let status = response.status();
                    if status.is_success() || last_attempt {
                        return Ok(response);
                    }
                    let retry_after =
                        retry_after_delay(response.headers(), self.retry_after_max, Utc::now());
                    if status.as_u16() == 429 {
                        // Only worth retrying when the provider says how soon.
                        match retry_after {
                            Some(wait) => delay = wait,
                            None => return Ok(response),
                        }
                    } else if status.as_u16() < 500 {
                        return Ok(response);
                    } else if let Some(wait) = retry_after {
                        delay = wait;
                    }
                }
                Err(err) if last_attempt => return Err(err),
                Err(_) => {}
            }

            tokio::time::sleep(delay).await;
            attempt += 1;
        }
    }

    /// A one-shot call: the parsed JSON body of a 2xx response, or the coded
    /// provider error for anything else. `label` names the provider in that
    /// error's message.
    pub async fn post_json(&self, request: &LlmRequest, label: &str) -> DomainResult<Value> {
        let response = self
            .fetch_with_retry(request, Some(self.request_timeout))
            .await
            .map_err(request_failed)?;

        let status = response.status();
        if !status.is_success() {
            let text = response.text().await.map_err(request_failed)?;
            return Err(provider_http_error(label, status.as_u16(), &text));
        }

        let bytes = response.bytes().await.map_err(request_failed)?;
        serde_json::from_slice(bytes.as_ref())
            .map_err(|err| DomainError::internal(LlmTransportError::InvalidBody(err)))
    }

    /// Opens a streamed call. A streaming reply can run well past a normal
    /// request's timeout as long as bytes keep arriving, so this is bounded
    /// by an idle deadline that starts now (catching a hung connect) and
    /// resets on every chunk, not by total duration.
    pub async fn post_stream(&self, request: &LlmRequest, label: &str) -> DomainResult<SseBody> {
        let idle = IdleDeadline::new(self.stream_idle_timeout);
        let response =
            idle.bound(self.fetch_with_retry(request, None)).await?.map_err(request_failed)?;

        let status = response.status();
        if !status.is_success() {
            let text = response.text().await.map_err(request_failed)?;
            return Err(provider_http_error(label, status.as_u16(), &text));
        }

        Ok(SseBody { response, parser: SseParser::default(), idle })
    }
}

/// The wait a `Retry-After` header asks for when it is present, parseable
/// (delta-seconds or an HTTP-date) and no longer than `max`.
pub fn retry_after_delay(
    headers: &HeaderMap,
    max: Duration,
    now: DateTime<Utc>,
) -> Option<Duration> {
    let raw = headers.get(RETRY_AFTER)?.to_str().ok()?.trim();
    if raw.is_empty() {
        return None;
    }
    let ms = match raw.parse::<f64>() {
        Ok(seconds) if seconds.is_finite() => seconds * 1000.0,
        _ => {
            let at = DateTime::parse_from_rfc2822(raw)
                .or_else(|_| DateTime::parse_from_rfc3339(raw))
                .ok()?;
            (at.with_timezone(&Utc) - now).num_milliseconds() as f64
        }
    };
    if !ms.is_finite() || ms < 0.0 || ms > max.as_millis() as f64 {
        return None;
    }
    Some(Duration::from_millis(ms as u64))
}

/// An idle timeout for a streamed call. Unlike a fixed timeout, which fires
/// a set time after the request starts whatever is on the wire, this only
/// expires once `idle` passes with no [`IdleDeadline::activity`]. Call it on
/// every chunk so a flowing stream is never cut off, while a connection that
/// goes quiet (including before the first chunk) is still caught.
#[derive(Debug)]
pub struct IdleDeadline {
    idle: Duration,
    deadline: Instant,
}

impl IdleDeadline {
    pub fn new(idle: Duration) -> Self {
        Self { idle, deadline: Instant::now() + idle }
    }

    pub fn activity(&mut self) {
        self.deadline = Instant::now() + self.idle;
    }

    /// Runs `future`, failing if the deadline passes first.
    pub async fn bound<F: Future>(&self, future: F) -> DomainResult<F::Output> {
        tokio::time::timeout_at(self.deadline, future)
            .await
            .map_err(|_| DomainError::internal(LlmTransportError::IdleTimeout))
    }
}

/// The body of a streamed provider reply, read as SSE frames. Dropping it
/// closes the connection.
#[derive(Debug)]
pub struct SseBody {
    response: reqwest::Response,
    parser: SseParser,
    idle: IdleDeadline,
}

impl SseBody {
    /// The frames completed by the next network read (possibly none), or
    /// `None` once the body has ended.
    pub async fn next_frames(&mut self) -> DomainResult<Option<Vec<SseFrame>>> {
        let chunk = self.idle.bound(self.response.chunk()).await?.map_err(request_failed)?;
        Ok(chunk.map(|bytes| {
            self.idle.activity();
            self.parser.push(bytes.as_ref())
        }))
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::infrastructure::llm::stub_server::{fast_transport, StubReply, StubServer};

    fn request(server: &StubServer) -> LlmRequest {
        LlmRequest {
            url: server.url("/v1"),
            headers: vec![("x-api-key", "secret".to_string())],
            body: "{\"a\":1}".to_string(),
        }
    }

    fn ok() -> StubReply {
        StubReply::json(200, json!({ "ok": true }))
    }

    async fn fetch(server: &StubServer) -> reqwest::Response {
        fast_transport()
            .fetch_with_retry(&request(server), Some(Duration::from_secs(5)))
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn returns_the_response_on_a_successful_first_attempt() {
        let server = StubServer::start(vec![ok()]).await;
        assert_eq!(fetch(&server).await.status(), 200);
        assert_eq!(server.request_count(), 1);
    }

    #[tokio::test]
    async fn posts_the_body_and_headers_it_was_given() {
        let server = StubServer::start(vec![ok()]).await;
        fetch(&server).await;

        let sent = server.only_request();
        assert_eq!(sent.method, "POST");
        assert_eq!(sent.uri, "/v1");
        assert_eq!(sent.header("x-api-key"), Some("secret"));
        assert_eq!(sent.header("content-type"), Some("application/json"));
        assert_eq!(sent.body, b"{\"a\":1}");
    }

    #[tokio::test]
    async fn returns_a_4xx_response_immediately_without_retrying() {
        let server = StubServer::start(vec![StubReply::text(401, "no")]).await;
        assert_eq!(fetch(&server).await.status(), 401);
        assert_eq!(server.request_count(), 1);
    }

    #[tokio::test]
    async fn never_follows_a_redirect() {
        let server = StubServer::start(vec![StubReply::redirect(307, "/elsewhere"), ok()]).await;
        assert_eq!(fetch(&server).await.status(), 307);
        assert_eq!(server.request_count(), 1);
    }

    #[tokio::test]
    async fn waits_out_a_short_retry_after_on_a_429_then_retries() {
        let server = StubServer::start(vec![
            StubReply::text(429, "slow down").with_header("retry-after", "0.3"),
            ok(),
        ])
        .await;

        let started = Instant::now();
        let response = fetch(&server).await;

        assert_eq!(response.status(), 200);
        assert_eq!(server.request_count(), 2);
        assert!(started.elapsed() >= Duration::from_millis(300));
    }

    #[tokio::test]
    async fn returns_a_429_immediately_when_there_is_no_retry_after() {
        let server = StubServer::start(vec![StubReply::text(429, "slow down")]).await;
        assert_eq!(fetch(&server).await.status(), 429);
        assert_eq!(server.request_count(), 1);
    }

    #[tokio::test]
    async fn returns_a_429_immediately_when_retry_after_is_longer_than_the_cap() {
        let over = (llm::RETRY_AFTER_MAX_MS / 1000 + 1).to_string();
        let server =
            StubServer::start(vec![StubReply::text(429, "").with_header("retry-after", &over)])
                .await;
        assert_eq!(fetch(&server).await.status(), 429);
        assert_eq!(server.request_count(), 1);
    }

    #[tokio::test]
    async fn uses_a_503_retry_after_instead_of_the_backoff() {
        let server = StubServer::start(vec![
            StubReply::text(503, "").with_header("retry-after", "0.3"),
            ok(),
        ])
        .await;

        let started = Instant::now();
        let response = fetch(&server).await;

        assert_eq!(response.status(), 200);
        assert_eq!(server.request_count(), 2);
        assert!(started.elapsed() >= Duration::from_millis(300));
    }

    #[tokio::test]
    async fn still_gives_up_after_the_attempt_budget_when_every_429_names_a_delay() {
        let server =
            StubServer::start(vec![StubReply::text(429, "").with_header("retry-after", "0.01")])
                .await;
        assert_eq!(fetch(&server).await.status(), 429);
        assert_eq!(server.request_count(), (llm::MAX_RETRIES + 1) as usize);
    }

    #[tokio::test]
    async fn retries_a_5xx_up_to_the_limit_then_returns_the_final_failure() {
        let server = StubServer::start(vec![StubReply::text(503, "down")]).await;
        assert_eq!(fetch(&server).await.status(), 503);
        assert_eq!(server.request_count(), (llm::MAX_RETRIES + 1) as usize);
    }

    #[tokio::test]
    async fn returns_a_successful_response_from_a_later_retry_after_a_5xx() {
        let server = StubServer::start(vec![StubReply::text(500, "boom"), ok()]).await;
        assert_eq!(fetch(&server).await.status(), 200);
        assert_eq!(server.request_count(), 2);
    }

    #[tokio::test]
    async fn waits_with_doubling_backoff_between_retries() {
        let server = StubServer::start(vec![StubReply::text(500, "boom")]).await;
        let transport = fast_transport();
        let base = transport.retry_backoff_base;

        let started = Instant::now();
        transport.fetch_with_retry(&request(&server), None).await.unwrap();
        let elapsed = started.elapsed();

        // base before the second attempt, then 2 × base before the third.
        assert_eq!(server.request_count(), 3);
        assert!(elapsed >= base * 3, "waited only {elapsed:?}");
        assert!(elapsed < base * 3 + Duration::from_secs(2), "waited {elapsed:?}");
    }

    #[tokio::test]
    async fn retries_a_network_error_then_returns_the_last_one() {
        // Bind then drop, so the port is closed and every connect is refused.
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}/v1", listener.local_addr().unwrap());
        drop(listener);
        let transport = fast_transport();
        let base = transport.retry_backoff_base;

        let started = Instant::now();
        let result = transport
            .fetch_with_retry(&LlmRequest { url, headers: vec![], body: "{}".to_string() }, None)
            .await;

        assert!(result.is_err());
        assert!(started.elapsed() >= base * 3);
    }

    #[tokio::test]
    async fn retries_an_attempt_that_times_out() {
        let server = StubServer::start(vec![StubReply::Hang, ok()]).await;
        let response = fast_transport()
            .fetch_with_retry(&request(&server), Some(Duration::from_millis(100)))
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
        assert_eq!(server.request_count(), 2);
    }

    #[tokio::test]
    async fn has_no_timeout_of_its_own_when_given_none() {
        let server = StubServer::start(vec![StubReply::Hang]).await;
        let transport = fast_transport();
        let request = request(&server);
        let pending = transport.fetch_with_retry(&request, None);
        let outcome = tokio::time::timeout(Duration::from_millis(300), pending).await;
        assert!(outcome.is_err(), "the call should still be waiting");
    }

    #[tokio::test]
    async fn dropping_the_call_abandons_the_request_and_stops_retrying() {
        let server = StubServer::start(vec![StubReply::Hang]).await;
        let transport = fast_transport();
        let request = request(&server);

        let call = tokio::spawn(async move {
            let _ = transport.fetch_with_retry(&request, Some(Duration::from_secs(30))).await;
        });
        server.wait_for_requests(1).await;
        call.abort();

        server.wait_for_abandoned(1).await;
        tokio::time::sleep(Duration::from_millis(200)).await;
        assert_eq!(server.request_count(), 1);
    }

    #[tokio::test]
    async fn post_json_reports_a_body_that_is_not_json_as_an_internal_error() {
        let server = StubServer::start(vec![StubReply::text(200, "<html>hello</html>")]).await;
        let err = fast_transport().post_json(&request(&server), "LLM provider").await.unwrap_err();
        assert!(matches!(err, DomainError::Internal(_)));
    }

    #[tokio::test]
    async fn post_stream_gives_up_when_no_response_arrives_within_the_idle_window() {
        let server = StubServer::start(vec![StubReply::Hang]).await;
        let transport =
            LlmTransport { stream_idle_timeout: Duration::from_millis(150), ..fast_transport() };

        let err = transport.post_stream(&request(&server), "LLM provider").await.unwrap_err();

        assert!(err.to_string().contains("timed out waiting for data"));
        // The idle deadline bounds the whole call, so it is not retried.
        assert_eq!(server.request_count(), 1);
    }

    #[tokio::test]
    async fn a_stream_that_goes_quiet_mid_body_times_out() {
        let server = StubServer::start(vec![StubReply::sse_then_hang(&["data: one\n\n"])]).await;
        let transport =
            LlmTransport { stream_idle_timeout: Duration::from_millis(150), ..fast_transport() };

        let mut body = transport.post_stream(&request(&server), "LLM provider").await.unwrap();
        let first = body.next_frames().await.unwrap().unwrap();
        assert_eq!(first[0].data, "one");

        let err = body.next_frames().await.unwrap_err();
        assert!(err.to_string().contains("timed out waiting for data"));
    }

    #[tokio::test]
    async fn a_stream_outlives_the_idle_window_while_chunks_keep_arriving() {
        let gap = Duration::from_millis(120);
        let chunks = ["data: a\n\n", "data: b\n\n", "data: c\n\n", "data: d\n\n"];
        let server = StubServer::start(vec![StubReply::sse_spaced(&chunks, gap)]).await;
        // Each gap is inside the idle window; their sum is well past it.
        let transport =
            LlmTransport { stream_idle_timeout: Duration::from_millis(300), ..fast_transport() };

        let mut body = transport.post_stream(&request(&server), "LLM provider").await.unwrap();
        let mut seen = Vec::new();
        while let Some(frames) = body.next_frames().await.unwrap() {
            seen.extend(frames.into_iter().map(|frame| frame.data));
        }

        assert_eq!(seen, vec!["a", "b", "c", "d"]);
    }

    fn headers(value: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(RETRY_AFTER, value.parse().unwrap());
        headers
    }

    #[test]
    fn retry_after_reads_delta_seconds_and_http_dates() {
        let max = Duration::from_secs(5);
        let now = DateTime::parse_from_rfc3339("2026-10-06T12:00:00Z").unwrap().with_timezone(&Utc);

        assert_eq!(retry_after_delay(&headers("2"), max, now), Some(Duration::from_secs(2)));
        assert_eq!(retry_after_delay(&headers("0"), max, now), Some(Duration::ZERO));
        assert_eq!(retry_after_delay(&headers("1.5"), max, now), Some(Duration::from_millis(1500)));
        assert_eq!(
            retry_after_delay(&headers("Tue, 06 Oct 2026 12:00:03 GMT"), max, now),
            Some(Duration::from_secs(3))
        );
    }

    #[test]
    fn retry_after_ignores_a_missing_unparseable_past_or_too_long_value() {
        let max = Duration::from_secs(5);
        let now = DateTime::parse_from_rfc3339("2026-10-06T12:00:00Z").unwrap().with_timezone(&Utc);

        assert_eq!(retry_after_delay(&HeaderMap::new(), max, now), None);
        assert_eq!(retry_after_delay(&headers("soon"), max, now), None);
        assert_eq!(retry_after_delay(&headers("-1"), max, now), None);
        assert_eq!(retry_after_delay(&headers("6"), max, now), None);
        assert_eq!(retry_after_delay(&headers("Tue, 06 Oct 2026 11:59:00 GMT"), max, now), None);
        assert_eq!(retry_after_delay(&headers("Tue, 06 Oct 2026 13:00:00 GMT"), max, now), None);
    }

    #[tokio::test]
    async fn idle_deadline_resets_on_activity() {
        let mut idle = IdleDeadline::new(Duration::from_millis(150));
        // Five waits just under the window: past it in total, never idle.
        for _ in 0..5 {
            idle.bound(tokio::time::sleep(Duration::from_millis(100))).await.unwrap();
            idle.activity();
        }
        let err = idle.bound(tokio::time::sleep(Duration::from_millis(400))).await.unwrap_err();
        assert!(matches!(err, DomainError::Internal(_)));
    }
}
