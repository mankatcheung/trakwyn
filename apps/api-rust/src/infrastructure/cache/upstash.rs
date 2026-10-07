use std::sync::Mutex;
use std::time::Duration;

use async_trait::async_trait;
use serde_json::{json, Value};

use super::redis_client::{RedisClient, RedisError, SetOptions};

/// How many times a request that never got an answer is sent again, and the
/// base of the wait between attempts (`e^attempt × base`). These are
/// `@upstash/redis`'s defaults, which `apps/api` runs with.
const RETRIES: u32 = 5;
const RETRY_BACKOFF_BASE: Duration = Duration::from_millis(50);

/// Upstash echoes a token on every response; sending the latest one back
/// makes a read see this client's own earlier writes on any replica.
const SYNC_TOKEN_HEADER: &str = "upstash-sync-token";

/// A value as it goes into a command: strings, numbers and booleans as they
/// are, anything else as its JSON text. This is `@upstash/redis`'s default
/// serializer, so both implementations store the same bytes.
pub(crate) fn encode_argument(value: &Value) -> Value {
    match value {
        Value::String(_) | Value::Number(_) | Value::Bool(_) => value.clone(),
        other => Value::String(other.to_string()),
    }
}

/// A reply as the caller sees it: a string that is JSON is parsed, anything
/// else is left alone. A numeric string stays a string unless it is exactly
/// how that number is written, so a long digit string is not rounded.
pub(crate) fn parse_reply(reply: Value) -> Value {
    let Value::String(text) = reply else {
        return reply;
    };
    match serde_json::from_str::<Value>(&text) {
        Ok(Value::Number(number)) if number.to_string() != text => Value::String(text),
        Ok(parsed) => parsed,
        Err(_) => Value::String(text),
    }
}

/// `RedisClient` over Upstash's REST API: each command is a JSON array
/// POSTed to the database URL with a bearer token.
pub struct UpstashRedisClient {
    http: reqwest::Client,
    url: String,
    token: String,
    sync_token: Mutex<String>,
    retries: u32,
    backoff_base: Duration,
}

impl UpstashRedisClient {
    /// `rest_url` and `rest_token` are `UPSTASH_REDIS_REST_URL` and
    /// `UPSTASH_REDIS_REST_TOKEN`.
    pub fn new(rest_url: &str, rest_token: &str) -> Result<Self, RedisError> {
        let http = reqwest::Client::builder()
            .build()
            .map_err(|err| RedisError::Transport(Box::new(err.without_url())))?;
        Ok(Self {
            http,
            url: rest_url.strip_suffix('/').unwrap_or(rest_url).to_string(),
            token: rest_token.to_string(),
            sync_token: Mutex::new(String::new()),
            retries: RETRIES,
            backoff_base: RETRY_BACKOFF_BASE,
        })
    }

    /// Overrides how a request that got no answer is retried.
    pub fn with_retry(mut self, retries: u32, backoff_base: Duration) -> Self {
        self.retries = retries;
        self.backoff_base = backoff_base;
        self
    }

    fn sync_token(&self) -> String {
        self.sync_token.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).clone()
    }

    fn remember_sync_token(&self, response: &reqwest::Response) {
        let token = response
            .headers()
            .get(SYNC_TOKEN_HEADER)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default()
            .to_string();
        *self.sync_token.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = token;
    }

    /// Sends the command, trying again only when no response arrived at all.
    async fn send(&self, command: &Value) -> Result<reqwest::Response, RedisError> {
        let mut attempt = 0;
        loop {
            let sent = self
                .http
                .post(&self.url)
                .bearer_auth(&self.token)
                .header(SYNC_TOKEN_HEADER, self.sync_token())
                .json(command)
                .send()
                .await;
            match sent {
                Ok(response) => return Ok(response),
                Err(err) if attempt >= self.retries => {
                    return Err(RedisError::Transport(Box::new(err.without_url())));
                }
                Err(_) => {
                    tokio::time::sleep(self.backoff_base.mul_f64(f64::from(attempt).exp())).await;
                    attempt += 1;
                }
            }
        }
    }

    async fn execute(&self, command: Value) -> Result<Value, RedisError> {
        let response = self.send(&command).await?;
        let status = response.status();
        self.remember_sync_token(&response);

        let body = response
            .text()
            .await
            .map_err(|err| RedisError::Transport(Box::new(err.without_url())))?;
        let mut body: Value = serde_json::from_str(&body).map_err(|_| {
            RedisError::Protocol(format!("the body of a {status} response was not JSON"))
        })?;

        let error = body.get("error").filter(|error| !error.is_null());
        if !status.is_success() || error.is_some() {
            let message = match error {
                Some(Value::String(message)) => message.clone(),
                Some(other) => other.to_string(),
                None => "no error message".to_string(),
            };
            return Err(RedisError::Command { status: status.as_u16(), message });
        }

        match body.get_mut("result") {
            Some(result) => Ok(result.take()),
            None => Err(RedisError::Protocol("the response carried no result".to_string())),
        }
    }
}

fn unexpected(command: &str, reply: &Value) -> RedisError {
    let kind = match reply {
        Value::Null => "null",
        Value::Bool(_) => "a boolean",
        Value::Number(_) => "a number",
        Value::String(_) => "a string",
        Value::Array(_) => "an array",
        Value::Object(_) => "an object",
    };
    RedisError::Protocol(format!("{command} answered with {kind}"))
}

#[async_trait]
impl RedisClient for UpstashRedisClient {
    async fn get(&self, key: &str) -> Result<Option<Value>, RedisError> {
        let reply = self.execute(json!(["get", key])).await?;
        Ok(Some(parse_reply(reply)).filter(|value| !value.is_null()))
    }

    async fn set(&self, key: &str, value: &Value, options: SetOptions) -> Result<bool, RedisError> {
        let mut command = vec![json!("set"), json!(key), encode_argument(value)];
        if options.nx {
            command.push(json!("nx"));
        }
        if let Some(ttl) = options.px {
            command.push(json!("px"));
            command.push(json!(u64::try_from(ttl.as_millis()).unwrap_or(u64::MAX)));
        }
        let reply = self.execute(Value::Array(command)).await?;
        Ok(!reply.is_null())
    }

    async fn del(&self, keys: &[String]) -> Result<u64, RedisError> {
        let mut command = vec![json!("del")];
        command.extend(keys.iter().map(|key| json!(key)));
        let reply = self.execute(Value::Array(command)).await?;
        reply.as_u64().ok_or_else(|| unexpected("del", &reply))
    }

    async fn incr(&self, key: &str) -> Result<i64, RedisError> {
        let reply = self.execute(json!(["incr", key])).await?;
        reply.as_i64().ok_or_else(|| unexpected("incr", &reply))
    }

    async fn scan(
        &self,
        cursor: &str,
        pattern: Option<&str>,
        count: Option<u32>,
    ) -> Result<(String, Vec<String>), RedisError> {
        let mut command = vec![json!("scan"), json!(cursor)];
        if let Some(pattern) = pattern {
            command.push(json!("match"));
            command.push(json!(pattern));
        }
        if let Some(count) = count {
            command.push(json!("count"));
            command.push(json!(count));
        }
        let reply = self.execute(Value::Array(command)).await?;

        let next = match reply.get(0) {
            Some(Value::String(cursor)) => cursor.clone(),
            Some(Value::Number(cursor)) => cursor.to_string(),
            _ => return Err(unexpected("scan", &reply)),
        };
        let keys = reply
            .get(1)
            .and_then(Value::as_array)
            .ok_or_else(|| unexpected("scan", &reply))?
            .iter()
            .filter_map(|key| key.as_str().map(str::to_string))
            .collect();
        Ok((next, keys))
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    use tokio::net::TcpListener;

    use super::super::test_support::StubUpstash;
    use super::*;

    fn client(stub: &StubUpstash) -> UpstashRedisClient {
        UpstashRedisClient::new(&stub.url(), "secret-token").unwrap()
    }

    #[test]
    fn encodes_arguments_as_the_original_client_does() {
        assert_eq!(encode_argument(&json!("1")), json!("1"));
        assert_eq!(encode_argument(&json!(1)), json!(1));
        assert_eq!(encode_argument(&json!(true)), json!(true));
        assert_eq!(encode_argument(&json!({ "v": null })), json!(r#"{"v":null}"#));
        assert_eq!(encode_argument(&json!([1, "a"])), json!(r#"[1,"a"]"#));
        assert_eq!(encode_argument(&Value::Null), json!("null"));
    }

    #[test]
    fn parses_replies_as_the_original_client_does() {
        assert_eq!(parse_reply(json!(r#"{"v":{"id":"a"}}"#)), json!({ "v": { "id": "a" } }));
        assert_eq!(parse_reply(json!("1")), json!(1));
        assert_eq!(parse_reply(json!("OK")), json!("OK"));
        assert_eq!(parse_reply(json!("null")), Value::Null);
        assert_eq!(parse_reply(json!(7)), json!(7));
        assert_eq!(parse_reply(Value::Null), Value::Null);
        // Not how that number is written, so it stays the string it was.
        assert_eq!(parse_reply(json!("007")), json!("007"));
        assert_eq!(parse_reply(json!("1e3")), json!("1e3"));
    }

    #[tokio::test]
    async fn posts_each_command_as_a_json_array_with_the_bearer_token() {
        let stub = StubUpstash::start().await;
        let redis = client(&stub);

        redis
            .set("lock:key", &json!("1"), SetOptions::nx_px(Duration::from_secs(10)))
            .await
            .unwrap();
        redis
            .set("key", &json!({ "v": { "id": "a" } }), SetOptions::px(Duration::from_millis(1500)))
            .await
            .unwrap();
        redis.set("plain", &json!(1), SetOptions::default()).await.unwrap();
        redis.get("key").await.unwrap();
        redis.incr("plain").await.unwrap();
        redis.scan("0", Some("apps:*"), Some(100)).await.unwrap();
        redis.del(&["key".to_string(), "plain".to_string()]).await.unwrap();

        let requests = stub.requests();
        assert_eq!(
            requests.iter().map(|request| request.command.clone()).collect::<Vec<_>>(),
            vec![
                json!(["set", "lock:key", "1", "nx", "px", 10_000]),
                json!(["set", "key", r#"{"v":{"id":"a"}}"#, "px", 1500]),
                json!(["set", "plain", 1]),
                json!(["get", "key"]),
                json!(["incr", "plain"]),
                json!(["scan", "0", "match", "apps:*", "count", 100]),
                json!(["del", "key", "plain"]),
            ]
        );
        assert!(requests
            .iter()
            .all(|request| request.authorization.as_deref() == Some("Bearer secret-token")));
        assert!(requests.iter().all(|request| request.path == "/"));
    }

    #[tokio::test]
    async fn round_trips_values_through_the_rest_api() {
        let stub = StubUpstash::start().await;
        let redis = client(&stub);

        assert_eq!(redis.get("missing").await.unwrap(), None);

        let envelope = json!({ "v": { "id": "a", "at": "2026-09-01T10:00:00.000Z", "n": null } });
        assert!(redis.set("key", &envelope, SetOptions::default()).await.unwrap());
        assert_eq!(redis.get("key").await.unwrap(), Some(envelope));

        // A stored JSON null reads back exactly like an absent key.
        redis.set("null", &Value::Null, SetOptions::default()).await.unwrap();
        assert_eq!(redis.get("null").await.unwrap(), None);
    }

    #[tokio::test]
    async fn reports_whether_an_nx_set_took_effect() {
        let stub = StubUpstash::start().await;
        let redis = client(&stub);
        let options = SetOptions::nx_px(Duration::from_secs(10));

        assert!(redis.set("lock", &json!("1"), options).await.unwrap());
        assert!(!redis.set("lock", &json!("1"), options).await.unwrap());
    }

    #[tokio::test]
    async fn increments_and_deletes() {
        let stub = StubUpstash::start().await;
        let redis = client(&stub);

        redis.set("count", &json!(1), SetOptions::default()).await.unwrap();
        assert_eq!(redis.incr("count").await.unwrap(), 2);
        assert_eq!(redis.incr("fresh").await.unwrap(), 1);
        assert_eq!(redis.get("count").await.unwrap(), Some(json!(2)));

        let keys = ["count".to_string(), "fresh".to_string(), "absent".to_string()];
        assert_eq!(redis.del(&keys).await.unwrap(), 2);
        assert_eq!(redis.get("count").await.unwrap(), None);
    }

    #[tokio::test]
    async fn pages_through_a_scan() {
        let stub = StubUpstash::start().await;
        let redis = client(&stub);
        for index in 0..5 {
            redis
                .set(&format!("apps:{index}"), &json!(index), SetOptions::default())
                .await
                .unwrap();
        }
        redis.set("other", &json!(1), SetOptions::default()).await.unwrap();

        let mut cursor = "0".to_string();
        let mut found = Vec::new();
        loop {
            let (next, keys) = redis.scan(&cursor, Some("apps:*"), Some(2)).await.unwrap();
            found.extend(keys);
            cursor = next;
            if cursor == "0" {
                break;
            }
        }

        assert_eq!(found, vec!["apps:0", "apps:1", "apps:2", "apps:3", "apps:4"]);
    }

    #[tokio::test]
    async fn sends_back_the_sync_token_the_last_response_carried() {
        let stub = StubUpstash::start().await;
        let redis = client(&stub);

        redis.get("a").await.unwrap();
        redis.get("b").await.unwrap();
        redis.get("c").await.unwrap();

        let tokens: Vec<_> =
            stub.requests().into_iter().map(|request| request.sync_token).collect();
        assert_eq!(
            tokens,
            vec![Some(String::new()), Some("t1".to_string()), Some("t2".to_string())]
        );
    }

    #[tokio::test]
    async fn accepts_a_url_with_a_trailing_slash() {
        let stub = StubUpstash::start().await;
        let redis = UpstashRedisClient::new(&format!("{}/", stub.url()), "secret-token").unwrap();

        redis.get("a").await.unwrap();

        assert_eq!(stub.requests()[0].path, "/");
    }

    #[tokio::test]
    async fn turns_an_error_response_into_an_error_without_quoting_the_command() {
        let stub = StubUpstash::start().await;
        stub.answer_with(401, r#"{"error":"WRONGPASS invalid or missing auth token"}"#);
        let redis = client(&stub);

        let err = redis.get("users:byEmail:someone@example.com").await.unwrap_err();

        assert!(matches!(err, RedisError::Command { status: 401, .. }));
        assert_eq!(err.to_string(), "Redis answered 401: WRONGPASS invalid or missing auth token");
        assert!(!err.to_string().contains("someone@example.com"));
        // An answer, even an error one, is not retried.
        assert_eq!(stub.requests().len(), 1);
    }

    #[tokio::test]
    async fn treats_an_error_in_a_successful_response_as_an_error() {
        let stub = StubUpstash::start().await;
        stub.answer_with(200, r#"{"error":"ERR value is not an integer or out of range"}"#);

        let err = client(&stub).incr("key").await.unwrap_err();

        assert!(matches!(err, RedisError::Command { status: 200, .. }));
    }

    #[tokio::test]
    async fn rejects_a_body_that_is_not_json_or_has_no_result() {
        let stub = StubUpstash::start().await;
        let redis = client(&stub);

        stub.answer_with(502, "<html>Bad Gateway</html>");
        assert!(matches!(redis.get("key").await.unwrap_err(), RedisError::Protocol(_)));

        stub.answer_with(200, "{}");
        assert!(matches!(redis.get("key").await.unwrap_err(), RedisError::Protocol(_)));

        stub.answer_with(200, r#"{"result":"not a number"}"#);
        assert!(matches!(redis.incr("key").await.unwrap_err(), RedisError::Protocol(_)));
    }

    /// Accepts connections and drops them without answering, counting them.
    async fn dead_end() -> (String, Arc<AtomicUsize>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let accepted = Arc::new(AtomicUsize::new(0));
        let counter = Arc::clone(&accepted);
        tokio::spawn(async move {
            while let Ok((socket, _)) = listener.accept().await {
                counter.fetch_add(1, Ordering::SeqCst);
                drop(socket);
            }
        });
        (url, accepted)
    }

    #[tokio::test]
    async fn retries_a_request_that_got_no_answer_then_gives_up() {
        let (url, accepted) = dead_end().await;
        let redis = UpstashRedisClient::new(&url, "secret-token")
            .unwrap()
            .with_retry(2, Duration::from_millis(1));

        let err = redis.get("key").await.unwrap_err();

        assert!(matches!(err, RedisError::Transport(_)));
        assert!(!err.to_string().contains("secret-token"));
        assert_eq!(accepted.load(Ordering::SeqCst), 3); // the first try and two more
    }

    #[test]
    fn retries_five_times_by_default_as_the_original_client_does() {
        let redis = UpstashRedisClient::new("https://example.upstash.io", "token").unwrap();
        assert_eq!(redis.retries, 5);
        assert_eq!(redis.backoff_base, Duration::from_millis(50));
    }
}
