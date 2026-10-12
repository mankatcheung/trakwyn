//! Test doubles for Redis: an in-memory `RedisClient`, and a local HTTP
//! server that speaks enough of Upstash's REST API to put the real client
//! in front of the same store.

use std::collections::BTreeMap;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use async_trait::async_trait;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::Router;
use serde_json::{json, Value};
use tokio::net::TcpListener;
use tokio::time::Instant;

use super::redis_client::{RedisClient, RedisError, SetOptions};
use super::upstash::{encode_argument, parse_reply};

struct Stored {
    text: String,
    expires_at: Option<Instant>,
}

/// In-memory stand-in for Redis, faithful to `SET NX`/`PX`, `INCR` and `SCAN`
/// semantics. Like Redis it stores strings, and it encodes and parses values
/// with the real client's own functions, so a value read back has been
/// through the same JSON round trip it would in production.
#[derive(Default)]
pub(crate) struct FakeRedisClient {
    store: Mutex<BTreeMap<String, Stored>>,
    failing: AtomicBool,
    calls: Mutex<Vec<&'static str>>,
}

impl FakeRedisClient {
    /// A client whose every call fails: Redis being unreachable.
    pub(crate) fn broken() -> Self {
        let redis = Self::default();
        redis.set_failing(true);
        redis
    }

    pub(crate) fn set_failing(&self, failing: bool) {
        self.failing.store(failing, Ordering::SeqCst);
    }

    /// The commands that reached this client, in order.
    pub(crate) fn calls(&self) -> Vec<&'static str> {
        self.calls.lock().unwrap().clone()
    }

    pub(crate) fn clear_calls(&self) {
        self.calls.lock().unwrap().clear();
    }

    fn begin(&self, command: &'static str) -> Result<(), RedisError> {
        if self.failing.load(Ordering::SeqCst) {
            return Err(RedisError::Transport("Redis unavailable".into()));
        }
        self.calls.lock().unwrap().push(command);
        Ok(())
    }

    /// The store with every expired key already gone.
    fn live(&self) -> MutexGuard<'_, BTreeMap<String, Stored>> {
        let mut store = self.store.lock().unwrap();
        let now = Instant::now();
        store.retain(|_, stored| stored.expires_at.is_none_or(|expires_at| now <= expires_at));
        store
    }

    pub(crate) fn raw_get(&self, key: &str) -> Option<String> {
        self.live().get(key).map(|stored| stored.text.clone())
    }

    /// `argument` is a command argument as it travels: a string, a number or
    /// a boolean. False when `nx` kept the existing value.
    pub(crate) fn raw_set(&self, key: &str, argument: &Value, options: SetOptions) -> bool {
        let mut store = self.live();
        if options.nx && store.contains_key(key) {
            return false;
        }
        let text = match argument {
            Value::String(text) => text.clone(),
            other => other.to_string(),
        };
        let expires_at = options.px.map(|ttl| Instant::now() + ttl);
        store.insert(key.to_string(), Stored { text, expires_at });
        true
    }

    pub(crate) fn raw_del(&self, keys: &[String]) -> u64 {
        let mut store = self.live();
        keys.iter().filter(|key| store.remove(key.as_str()).is_some()).count() as u64
    }

    /// A fresh key is created without a TTL; an existing one keeps its own.
    pub(crate) fn raw_incr(&self, key: &str) -> i64 {
        let mut store = self.live();
        let (current, expires_at) = match store.get(key) {
            Some(stored) => (stored.text.parse::<i64>().unwrap_or(0), stored.expires_at),
            None => (0, None),
        };
        let next = current + 1;
        store.insert(key.to_string(), Stored { text: next.to_string(), expires_at });
        next
    }

    /// Resumes strictly after the last key returned rather than at an index,
    /// as real `SCAN` guarantees: keys the caller deleted mid-walk do not
    /// shift what is still to come.
    pub(crate) fn raw_scan(
        &self,
        cursor: &str,
        pattern: Option<&str>,
        count: Option<u32>,
    ) -> (String, Vec<String>) {
        let store = self.live();
        let matches = |key: &str| match pattern {
            None => true,
            Some(pattern) => match pattern.strip_suffix('*') {
                Some(prefix) => key.starts_with(prefix),
                None => key == pattern,
            },
        };
        let remaining: Vec<String> = store
            .keys()
            .filter(|key| matches(key))
            .filter(|key| cursor == "0" || key.as_str() > cursor)
            .cloned()
            .collect();
        let page_size = count.map_or(remaining.len(), |count| count as usize);
        let page: Vec<String> = remaining.iter().take(page_size).cloned().collect();
        let next = match page.last() {
            Some(last) if page.len() < remaining.len() => last.clone(),
            _ => "0".to_string(),
        };
        (next, page)
    }
}

#[async_trait]
impl RedisClient for FakeRedisClient {
    async fn get(&self, key: &str) -> Result<Option<Value>, RedisError> {
        self.begin("get")?;
        Ok(self
            .raw_get(key)
            .map(|text| parse_reply(Value::String(text)))
            .filter(|value| !value.is_null()))
    }

    async fn set(&self, key: &str, value: &Value, options: SetOptions) -> Result<bool, RedisError> {
        self.begin("set")?;
        Ok(self.raw_set(key, &encode_argument(value), options))
    }

    async fn del(&self, keys: &[String]) -> Result<u64, RedisError> {
        self.begin("del")?;
        Ok(self.raw_del(keys))
    }

    async fn incr(&self, key: &str) -> Result<i64, RedisError> {
        self.begin("incr")?;
        Ok(self.raw_incr(key))
    }

    async fn scan(
        &self,
        cursor: &str,
        pattern: Option<&str>,
        count: Option<u32>,
    ) -> Result<(String, Vec<String>), RedisError> {
        self.begin("scan")?;
        Ok(self.raw_scan(cursor, pattern, count))
    }
}

/// One request the stub received.
#[derive(Debug, Clone)]
pub(crate) struct StubRequest {
    pub(crate) path: String,
    pub(crate) authorization: Option<String>,
    pub(crate) sync_token: Option<String>,
    pub(crate) command: Value,
}

#[derive(Default)]
struct StubState {
    redis: FakeRedisClient,
    requests: Mutex<Vec<StubRequest>>,
    canned: Mutex<Option<(u16, String)>>,
}

/// A local server answering Upstash REST commands from a `FakeRedisClient`.
pub(crate) struct StubUpstash {
    address: SocketAddr,
    state: Arc<StubState>,
}

impl StubUpstash {
    pub(crate) async fn start() -> Self {
        let state = Arc::new(StubState::default());
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let app = Router::new().fallback(handle).with_state(Arc::clone(&state));
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        Self { address, state }
    }

    pub(crate) fn url(&self) -> String {
        format!("http://{}", self.address)
    }

    pub(crate) fn requests(&self) -> Vec<StubRequest> {
        self.state.requests.lock().unwrap().clone()
    }

    /// Answers every later request with this status and body instead of
    /// running the command.
    pub(crate) fn answer_with(&self, status: u16, body: &str) {
        *self.state.canned.lock().unwrap() = Some((status, body.to_string()));
    }

    /// What Redis itself holds for `key`.
    pub(crate) fn stored(&self, key: &str) -> Option<String> {
        self.state.redis.raw_get(key)
    }
}

fn text(arguments: &[Value], index: usize) -> String {
    match arguments.get(index) {
        Some(Value::String(text)) => text.clone(),
        Some(other) => other.to_string(),
        None => String::new(),
    }
}

fn run(redis: &FakeRedisClient, command: &Value) -> Result<Value, String> {
    let arguments = command.as_array().ok_or("ERR the command must be an array")?;
    let name = text(arguments, 0).to_lowercase();
    let key = text(arguments, 1);
    match name.as_str() {
        "get" => Ok(redis.raw_get(&key).map_or(Value::Null, Value::String)),
        "set" => {
            let mut options = SetOptions::default();
            let mut index = 3;
            while index < arguments.len() {
                match text(arguments, index).to_lowercase().as_str() {
                    "nx" => options.nx = true,
                    "px" => {
                        index += 1;
                        let millis = arguments.get(index).and_then(Value::as_u64);
                        options.px = Some(Duration::from_millis(millis.ok_or("ERR bad px")?));
                    }
                    other => return Err(format!("ERR unsupported SET option {other}")),
                }
                index += 1;
            }
            let argument = arguments.get(2).ok_or("ERR wrong number of arguments")?;
            Ok(if redis.raw_set(&key, argument, options) { json!("OK") } else { Value::Null })
        }
        "del" => {
            let keys: Vec<String> = (1..arguments.len()).map(|i| text(arguments, i)).collect();
            Ok(json!(redis.raw_del(&keys)))
        }
        "incr" => Ok(json!(redis.raw_incr(&key))),
        "scan" => {
            let mut pattern = None;
            let mut count = None;
            let mut index = 2;
            while index + 1 < arguments.len() {
                match text(arguments, index).to_lowercase().as_str() {
                    "match" => pattern = Some(text(arguments, index + 1)),
                    "count" => count = arguments[index + 1].as_u64().map(|count| count as u32),
                    other => return Err(format!("ERR unsupported SCAN option {other}")),
                }
                index += 2;
            }
            let (next, keys) = redis.raw_scan(&key, pattern.as_deref(), count);
            Ok(json!([next, keys]))
        }
        other => Err(format!("ERR unknown command '{other}'")),
    }
}

async fn handle(
    State(state): State<Arc<StubState>>,
    uri: Uri,
    headers: HeaderMap,
    body: String,
) -> Response {
    let header = |name: &str| headers.get(name).and_then(|v| v.to_str().ok()).map(str::to_string);
    let command: Value = serde_json::from_str(&body).unwrap_or(Value::Null);
    let seen = {
        let mut requests = state.requests.lock().unwrap();
        requests.push(StubRequest {
            path: uri.path().to_string(),
            authorization: header("authorization"),
            sync_token: header("upstash-sync-token"),
            command: command.clone(),
        });
        requests.len()
    };
    let sync_token = [("upstash-sync-token", format!("t{seen}"))];

    if let Some((status, body)) = state.canned.lock().unwrap().clone() {
        let status = StatusCode::from_u16(status).unwrap();
        return (status, sync_token, body).into_response();
    }
    match run(&state.redis, &command) {
        Ok(result) => (sync_token, json!({ "result": result }).to_string()).into_response(),
        Err(error) => {
            let body = json!({ "error": error }).to_string();
            (StatusCode::BAD_REQUEST, sync_token, body).into_response()
        }
    }
}
