//! LLM key management through the real GraphQL endpoint and a real database.
//!
//! No test here reaches a real provider: a saved `custom` key points at
//! [`LlmStub`], an OpenAI-compatible server on a loopback port. The test
//! config is not production, so the outbound URL policy lets that through.

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

use axum::body::Bytes;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response as AxumResponse};
use axum::routing::post;
use axum::{Json, Router};
use serde_json::{json, Value};

use trakwyn_api::config::{Config, NodeEnv};

use crate::common::{seed_application, seed_user, Auth, Response, TestApp, JWT_REFRESH_SECRET, JWT_SECRET};

pub const STUB_PATH: &str = "/v1/chat/completions";
pub const STUB_MODEL: &str = "stub-model";
pub const STUB_KEY: &str = "sk-stub-secret-0123456789";

/// One request the stub received.
#[derive(Debug, Clone)]
pub struct StubRequest {
    pub authorization: Option<String>,
    pub body: Value,
}

impl StubRequest {
    /// The content of the last message: the user prompt.
    pub fn user_prompt(&self) -> String {
        self.body["messages"]
            .as_array()
            .and_then(|messages| messages.last())
            .and_then(|message| message["content"].as_str())
            .unwrap_or_default()
            .to_string()
    }

    pub fn system_prompts(&self) -> Vec<String> {
        self.body["messages"]
            .as_array()
            .map(|messages| {
                messages
                    .iter()
                    .filter(|message| message["role"] == "system")
                    .filter_map(|message| message["content"].as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_default()
    }
}

#[derive(Default)]
struct StubState {
    replies: Mutex<VecDeque<(u16, Value)>>,
    requests: Mutex<Vec<StubRequest>>,
}

/// An OpenAI-compatible `/chat/completions` endpoint on a loopback port. It
/// answers with the queued replies in order, then with a plain "ok"
/// completion, and records every request.
pub struct LlmStub {
    pub url: String,
    state: Arc<StubState>,
}

/// A completion whose message is `content`, reporting 11 prompt tokens and
/// 3 completion tokens.
pub fn completion(content: &str) -> (u16, Value) {
    (
        200,
        json!({
            "choices": [{ "message": { "content": content }, "finish_reason": "stop" }],
            "usage": { "prompt_tokens": 11, "completion_tokens": 3 }
        }),
    )
}

async fn stub_handler(
    State(state): State<Arc<StubState>>,
    headers: HeaderMap,
    body: Bytes,
) -> AxumResponse {
    state.requests.lock().unwrap().push(StubRequest {
        authorization: headers
            .get("authorization")
            .and_then(|value| value.to_str().ok())
            .map(str::to_string),
        body: serde_json::from_slice(&body).unwrap_or(Value::Null),
    });
    let (status, body) =
        state.replies.lock().unwrap().pop_front().unwrap_or_else(|| completion("ok"));
    (StatusCode::from_u16(status).unwrap(), Json(body)).into_response()
}

impl LlmStub {
    pub async fn start(replies: Vec<(u16, Value)>) -> Self {
        let state = Arc::new(StubState {
            replies: Mutex::new(replies.into()),
            requests: Mutex::default(),
        });
        let router = Router::new().route(STUB_PATH, post(stub_handler)).with_state(state.clone());
        Self { url: serve(router).await + STUB_PATH, state }
    }

    pub fn requests(&self) -> Vec<StubRequest> {
        self.state.requests.lock().unwrap().clone()
    }

    pub fn only_request(&self) -> StubRequest {
        let requests = self.requests();
        assert_eq!(requests.len(), 1, "expected exactly one provider call");
        requests[0].clone()
    }
}

/// Serves `router` on a free loopback port and returns its origin.
pub async fn serve(router: Router) -> String {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    format!("http://{address}")
}

/// The shared test config plus the passphrase keys are encrypted under.
pub fn llm_config() -> Config {
    let base = Config::from_lookup(|name| match name {
        "DATABASE_URL" => Some("postgres://unused-the-pool-is-injected/test".to_string()),
        "JWT_SECRET" => Some(JWT_SECRET.to_string()),
        "JWT_REFRESH_SECRET" => Some(JWT_REFRESH_SECRET.to_string()),
        "EMAIL_PROVIDER" => Some("console".to_string()),
        "LLM_API_KEY_ENCRYPTION_KEY" => Some("an integration test passphrase".to_string()),
        _ => None,
    })
    .unwrap();
    Config { port: 0, node_env: NodeEnv::Test, ..base }
}

pub const SAVE: &str = "mutation($provider: String!, $apiKey: String!, $model: String, $baseUrl: String) {
    saveLlmApiKey(provider: $provider, apiKey: $apiKey, model: $model, baseUrl: $baseUrl)
}";
const LIST: &str = "{ llmApiKeys { provider model baseUrl monthlyTokenLimit } }";
const DELETE: &str = "mutation($provider: String!) { deleteLlmApiKey(provider: $provider) }";
const SET_DEFAULT: &str =
    "mutation($provider: String!) { setDefaultLlmProvider(provider: $provider) }";
pub const SET_LIMIT: &str = "mutation($provider: String!, $limit: Int) {
    setLlmApiKeyMonthlyLimit(provider: $provider, monthlyTokenLimit: $limit)
}";
const TEST: &str = "mutation($provider: String!, $apiKey: String, $model: String, $baseUrl: String) {
    testLlmApiKey(provider: $provider, apiKey: $apiKey, model: $model, baseUrl: $baseUrl) { ok error }
}";
pub const USAGE: &str = "{ llmUsageSummary {
    provider requestCount promptTokens completionTokens cacheReadTokens cacheWriteTokens
    lastUsedAt monthlyTokenLimit limitReached
} }";

/// An app with one user (`owner`) who owns `app-1`, and that user's token.
pub async fn app_with_owner() -> (TestApp, String) {
    let app = TestApp::start_with(llm_config()).await;
    seed_user(&app.db, "owner").await;
    seed_application(&app.db, "app-1", "owner").await;
    let token = app.access_token("owner");
    (app, token)
}

/// Saves a `custom` key pointing at the stub, through the API.
pub async fn save_custom_key(app: &TestApp, token: &str, stub: &LlmStub) {
    let variables = json!({
        "provider": "custom", "apiKey": STUB_KEY, "model": STUB_MODEL, "baseUrl": stub.url
    });
    let response = app.graphql(SAVE, variables, Auth::Bearer(token)).await;
    assert_eq!(response.data("saveLlmApiKey"), &Value::Bool(true));
}

async fn save_named_key(app: &TestApp, token: &str, provider: &str) -> Response {
    app.graphql(SAVE, json!({ "provider": provider, "apiKey": "sk-named" }), Auth::Bearer(token))
        .await
}

async fn default_provider(app: &TestApp) -> Option<String> {
    sqlx::query_scalar(r#"SELECT "defaultLlmProvider" FROM "User" WHERE "id" = 'owner'"#)
        .fetch_one(app.db.pool())
        .await
        .unwrap()
}

pub async fn usage_event_count(app: &TestApp) -> i64 {
    sqlx::query_scalar(r#"SELECT count(*) FROM "LlmUsageEvent""#)
        .fetch_one(app.db.pool())
        .await
        .unwrap()
}

#[tokio::test]
async fn saves_a_key_encrypted_and_lists_it_without_any_key_material() {
    let (app, token) = app_with_owner().await;
    let stub = LlmStub::start(vec![]).await;

    save_custom_key(&app, &token, &stub).await;

    let listed = app.graphql(LIST, json!({}), Auth::Bearer(&token)).await;
    assert_eq!(
        listed.data("llmApiKeys"),
        &json!([{
            "provider": "custom", "model": STUB_MODEL, "baseUrl": stub.url, "monthlyTokenLimit": null
        }])
    );
    assert!(!listed.body.to_string().contains(STUB_KEY));

    let stored: String = sqlx::query_scalar(r#"SELECT "apiKey" FROM "LlmApiKey""#)
        .fetch_one(app.db.pool())
        .await
        .unwrap();
    assert!(!stored.contains(STUB_KEY));
    assert!(!listed.body.to_string().contains(&stored));
    assert_eq!(stub.requests().len(), 0, "saving a key never calls the provider");
}

#[tokio::test]
async fn the_schema_has_no_field_that_could_return_a_key() {
    let (app, token) = app_with_owner().await;

    let response = app.graphql("{ llmApiKeys { apiKey } }", json!({}), Auth::Bearer(&token)).await;

    assert!(response.body["errors"][0]["message"].as_str().unwrap().contains("apiKey"));
    assert!(response.body["data"].is_null());
}

#[tokio::test]
async fn the_first_key_saved_becomes_the_default_and_later_ones_do_not_replace_it() {
    let (app, token) = app_with_owner().await;

    save_named_key(&app, &token, "anthropic").await.data("saveLlmApiKey");
    save_named_key(&app, &token, "openai").await.data("saveLlmApiKey");

    assert_eq!(default_provider(&app).await.as_deref(), Some("anthropic"));
}

#[tokio::test]
async fn saving_again_replaces_the_key_in_place() {
    let (app, token) = app_with_owner().await;
    save_named_key(&app, &token, "openai").await.data("saveLlmApiKey");
    let variables = json!({ "provider": "openai", "apiKey": "sk-rotated", "model": "gpt-4o-mini" });

    app.graphql(SAVE, variables, Auth::Bearer(&token)).await.data("saveLlmApiKey");

    let listed = app.graphql(LIST, json!({}), Auth::Bearer(&token)).await;
    assert_eq!(
        listed.data("llmApiKeys"),
        &json!([{ "provider": "openai", "model": "gpt-4o-mini", "baseUrl": null, "monthlyTokenLimit": null }])
    );
}

#[tokio::test]
async fn refuses_a_malformed_key_with_the_reason() {
    let (app, token) = app_with_owner().await;
    let cases = [
        (json!({ "provider": "skynet", "apiKey": "k" }), "Unsupported AI provider"),
        (json!({ "provider": "openai", "apiKey": "   " }), "API key is required"),
        (
            json!({ "provider": "openai", "apiKey": "k", "baseUrl": "https://x.example/v1" }),
            "A base URL can only be set for a custom provider",
        ),
        (
            json!({ "provider": "custom", "apiKey": "k", "model": "m" }),
            "A base URL is required for a custom provider",
        ),
        (
            json!({ "provider": "custom", "apiKey": "k", "model": "m", "baseUrl": "ftp://x.example" }),
            "Base URL must be a valid http(s) URL",
        ),
        (
            json!({ "provider": "custom", "apiKey": "k", "baseUrl": "https://x.example/v1" }),
            "A model is required for a custom provider",
        ),
        (
            json!({ "provider": "googleai", "apiKey": "k", "model": "../../files?x=1" }),
            "Model name contains characters that are not allowed",
        ),
    ];

    for (variables, message) in cases {
        let response = app.graphql(SAVE, variables, Auth::Bearer(&token)).await;
        assert_eq!(response.error_code(), "VALIDATION", "{message}");
        assert_eq!(response.error_message(), message);
        assert_eq!(response.body["errors"][0]["extensions"]["statusCode"], 400);
    }
    let listed = app.graphql(LIST, json!({}), Auth::Bearer(&token)).await;
    assert_eq!(listed.data("llmApiKeys"), &json!([]));
}

#[tokio::test]
async fn deleting_the_default_key_clears_the_default() {
    let (app, token) = app_with_owner().await;
    save_named_key(&app, &token, "openai").await.data("saveLlmApiKey");
    save_named_key(&app, &token, "groq").await.data("saveLlmApiKey");

    let deleted =
        app.graphql(DELETE, json!({ "provider": "openai" }), Auth::Bearer(&token)).await;

    assert_eq!(deleted.data("deleteLlmApiKey"), &Value::Bool(true));
    assert_eq!(default_provider(&app).await, None);
    let listed = app.graphql(LIST, json!({}), Auth::Bearer(&token)).await;
    assert_eq!(listed.data("llmApiKeys")[0]["provider"], "groq");
    assert_eq!(listed.data("llmApiKeys").as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn the_default_can_only_be_a_provider_with_a_key() {
    let (app, token) = app_with_owner().await;
    save_named_key(&app, &token, "openai").await.data("saveLlmApiKey");
    save_named_key(&app, &token, "groq").await.data("saveLlmApiKey");

    let refused =
        app.graphql(SET_DEFAULT, json!({ "provider": "anthropic" }), Auth::Bearer(&token)).await;
    assert_eq!(refused.error_code(), "VALIDATION");
    assert_eq!(
        refused.error_message(),
        "Add an API key for this provider before making it the default"
    );

    let set = app.graphql(SET_DEFAULT, json!({ "provider": "groq" }), Auth::Bearer(&token)).await;
    assert_eq!(set.data("setDefaultLlmProvider"), &Value::Bool(true));
    assert_eq!(default_provider(&app).await.as_deref(), Some("groq"));
}

#[tokio::test]
async fn sets_and_clears_a_monthly_limit() {
    let (app, token) = app_with_owner().await;
    save_named_key(&app, &token, "openai").await.data("saveLlmApiKey");
    let limit = |limit: Value| json!({ "provider": "openai", "limit": limit });

    let set = app.graphql(SET_LIMIT, limit(json!(2_000_000)), Auth::Bearer(&token)).await;
    assert_eq!(set.data("setLlmApiKeyMonthlyLimit"), &Value::Bool(true));
    let listed = app.graphql(LIST, json!({}), Auth::Bearer(&token)).await;
    assert_eq!(listed.data("llmApiKeys")[0]["monthlyTokenLimit"], 2_000_000);

    // Rotating the key leaves the limit alone.
    save_named_key(&app, &token, "openai").await.data("saveLlmApiKey");
    let listed = app.graphql(LIST, json!({}), Auth::Bearer(&token)).await;
    assert_eq!(listed.data("llmApiKeys")[0]["monthlyTokenLimit"], 2_000_000);

    app.graphql(SET_LIMIT, json!({ "provider": "openai" }), Auth::Bearer(&token))
        .await
        .data("setLlmApiKeyMonthlyLimit");
    let listed = app.graphql(LIST, json!({}), Auth::Bearer(&token)).await;
    assert_eq!(listed.data("llmApiKeys")[0]["monthlyTokenLimit"], Value::Null);
}

#[tokio::test]
async fn refuses_a_limit_below_one_and_a_provider_without_a_key() {
    let (app, token) = app_with_owner().await;
    save_named_key(&app, &token, "openai").await.data("saveLlmApiKey");

    for limit in [0, -3] {
        let response = app
            .graphql(SET_LIMIT, json!({ "provider": "openai", "limit": limit }), Auth::Bearer(&token))
            .await;
        assert_eq!(response.error_code(), "VALIDATION");
        assert_eq!(response.error_message(), "Monthly token limit must be at least 1");
    }

    let missing = app
        .graphql(SET_LIMIT, json!({ "provider": "groq", "limit": 10 }), Auth::Bearer(&token))
        .await;
    assert_eq!(missing.error_code(), "NOT_FOUND");
    assert_eq!(missing.error_message(), "No API key configured for this provider not found");
    assert_eq!(missing.body["errors"][0]["extensions"]["statusCode"], 404);
}

#[tokio::test]
async fn tests_an_unsaved_key_against_the_provider_without_storing_or_metering_it() {
    let (app, token) = app_with_owner().await;
    let stub = LlmStub::start(vec![]).await;
    let variables = json!({
        "provider": "custom", "apiKey": "  sk-unsaved  ", "model": STUB_MODEL, "baseUrl": stub.url
    });

    let response = app.graphql(TEST, variables, Auth::Bearer(&token)).await;

    assert_eq!(response.data("testLlmApiKey"), &json!({ "ok": true, "error": null }));
    let request = stub.only_request();
    assert_eq!(request.authorization.as_deref(), Some("Bearer sk-unsaved"));
    assert_eq!(request.body["model"], STUB_MODEL);
    assert_eq!(request.body["max_tokens"], 5);
    assert_eq!(
        request.user_prompt(),
        "Reply with a single word to confirm this connection works."
    );
    assert_eq!(usage_event_count(&app).await, 0);
    let listed = app.graphql(LIST, json!({}), Auth::Bearer(&token)).await;
    assert_eq!(listed.data("llmApiKeys"), &json!([]));
}

#[tokio::test]
async fn tests_a_saved_key_with_the_decrypted_secret_and_does_not_meter_it() {
    let (app, token) = app_with_owner().await;
    let stub = LlmStub::start(vec![]).await;
    save_custom_key(&app, &token, &stub).await;

    let response =
        app.graphql(TEST, json!({ "provider": "custom" }), Auth::Bearer(&token)).await;

    assert_eq!(response.data("testLlmApiKey")["ok"], true);
    assert_eq!(stub.only_request().authorization, Some(format!("Bearer {STUB_KEY}")));
    assert_eq!(usage_event_count(&app).await, 0);
}

#[tokio::test]
async fn a_saved_key_past_its_limit_can_still_be_tested() {
    let (app, token) = app_with_owner().await;
    let stub = LlmStub::start(vec![]).await;
    save_custom_key(&app, &token, &stub).await;
    seed_usage(&app, "custom", 900, 100).await;
    app.graphql(SET_LIMIT, json!({ "provider": "custom", "limit": 1000 }), Auth::Bearer(&token))
        .await
        .data("setLlmApiKeyMonthlyLimit");

    let response =
        app.graphql(TEST, json!({ "provider": "custom" }), Auth::Bearer(&token)).await;

    assert_eq!(response.data("testLlmApiKey")["ok"], true);
}

#[tokio::test]
async fn a_rejected_key_is_reported_with_classified_copy_never_the_providers_words() {
    let (app, token) = app_with_owner().await;
    let secret_body = json!({ "error": { "message": "INTERNAL-ADMIN-PAGE sk-unsaved is invalid" } });
    let stub = LlmStub::start(vec![(401, secret_body)]).await;
    let variables = json!({
        "provider": "custom", "apiKey": "sk-unsaved", "model": STUB_MODEL, "baseUrl": stub.url
    });

    let response = app.graphql(TEST, variables, Auth::Bearer(&token)).await;

    let result = response.data("testLlmApiKey");
    assert_eq!(result["ok"], false);
    let error = result["error"].as_str().unwrap();
    assert!(
        error.starts_with("The provider rejected this API key — check it in Settings and try again"),
        "{error}"
    );
    let whole = response.body.to_string();
    assert!(!whole.contains("INTERNAL-ADMIN-PAGE"));
    assert!(!whole.contains("sk-unsaved"));
}

#[tokio::test]
async fn an_unreachable_endpoint_is_reported_as_unreachable() {
    let (app, token) = app_with_owner().await;
    let variables = json!({
        "provider": "custom", "apiKey": "sk-unsaved", "model": STUB_MODEL,
        "baseUrl": "http://127.0.0.1:1/v1/chat/completions"
    });

    let response = app.graphql(TEST, variables, Auth::Bearer(&token)).await;

    let result = response.data("testLlmApiKey");
    assert_eq!(result["ok"], false);
    assert!(result["error"]
        .as_str()
        .unwrap()
        .starts_with("Could not reach the provider — check the base URL and try again"));
}

#[tokio::test]
async fn testing_a_provider_with_no_saved_key_is_ai_not_configured() {
    let (app, token) = app_with_owner().await;

    let response =
        app.graphql(TEST, json!({ "provider": "openai" }), Auth::Bearer(&token)).await;

    assert_eq!(response.error_code(), "AI_NOT_CONFIGURED");
    assert_eq!(response.error_message(), "No API key saved for this provider yet");
    assert_eq!(response.body["errors"][0]["extensions"]["statusCode"], 400);
}

#[tokio::test]
async fn the_key_test_is_rate_limited_per_user() {
    let (app, token) = app_with_owner().await;

    let mut last = None;
    for _ in 0..11 {
        last = Some(app.graphql(TEST, json!({ "provider": "openai" }), Auth::Bearer(&token)).await);
    }

    let last = last.unwrap();
    assert_eq!(last.error_code(), "RATE_LIMITED");
    assert_eq!(
        last.error_message(),
        "Too many test attempts — please wait a moment and try again"
    );
    assert_eq!(last.body["errors"][0]["extensions"]["statusCode"], 429);
}

/// Inserts one usage event for `owner`, dated now.
pub async fn seed_usage(app: &TestApp, provider: &str, prompt: i32, completion: i32) {
    sqlx::query(
        r#"INSERT INTO "LlmUsageEvent"
             ("id", "userId", "provider", "promptTokens", "completionTokens", "createdAt")
           VALUES ($1, 'owner', $2, $3, $4, $5)"#,
    )
    .bind(nanoid::nanoid!())
    .bind(provider)
    .bind(prompt)
    .bind(completion)
    .bind(trakwyn_api::use_cases::clock::now())
    .execute(app.db.pool())
    .await
    .unwrap();
}

#[tokio::test]
async fn summarises_this_months_usage_against_each_keys_limit() {
    let (app, token) = app_with_owner().await;
    save_named_key(&app, &token, "openai").await.data("saveLlmApiKey");
    save_named_key(&app, &token, "groq").await.data("saveLlmApiKey");
    app.graphql(SET_LIMIT, json!({ "provider": "openai", "limit": 1000 }), Auth::Bearer(&token))
        .await
        .data("setLlmApiKeyMonthlyLimit");
    seed_usage(&app, "openai", 600, 300).await;
    seed_usage(&app, "openai", 90, 10).await;
    seed_usage(&app, "groq", 5, 5).await;
    // Last year's usage is not this month's.
    sqlx::query(
        r#"INSERT INTO "LlmUsageEvent"
             ("id", "userId", "provider", "promptTokens", "completionTokens", "createdAt")
           VALUES ('old', 'owner', 'groq', 999999, 0, now() - interval '400 days')"#,
    )
    .execute(app.db.pool())
    .await
    .unwrap();

    let response = app.graphql(USAGE, json!({}), Auth::Bearer(&token)).await;

    let summaries = response.data("llmUsageSummary").as_array().unwrap().clone();
    assert_eq!(summaries.len(), 2);
    let by_provider =
        |provider: &str| summaries.iter().find(|s| s["provider"] == provider).unwrap().clone();
    let openai = by_provider("openai");
    assert_eq!(openai["requestCount"], 2);
    assert_eq!(openai["promptTokens"], 690);
    assert_eq!(openai["completionTokens"], 310);
    assert_eq!(openai["cacheReadTokens"], 0);
    assert_eq!(openai["cacheWriteTokens"], 0);
    assert_eq!(openai["monthlyTokenLimit"], 1000);
    assert_eq!(openai["limitReached"], true);
    assert_eq!(openai["lastUsedAt"].as_str().unwrap().len(), 24);
    let groq = by_provider("groq");
    assert_eq!(groq["promptTokens"], 5);
    assert_eq!(groq["monthlyTokenLimit"], Value::Null);
    assert_eq!(groq["limitReached"], false);
}

#[tokio::test]
async fn every_key_operation_needs_a_signed_in_user() {
    let (app, _token) = app_with_owner().await;
    let operations = [
        (LIST, json!({}), "llmApiKeys"),
        (USAGE, json!({}), "llmUsageSummary"),
        (SAVE, json!({ "provider": "openai", "apiKey": "k" }), "saveLlmApiKey"),
        (DELETE, json!({ "provider": "openai" }), "deleteLlmApiKey"),
        (SET_DEFAULT, json!({ "provider": "openai" }), "setDefaultLlmProvider"),
        (SET_LIMIT, json!({ "provider": "openai", "limit": 5 }), "setLlmApiKeyMonthlyLimit"),
        (TEST, json!({ "provider": "openai" }), "testLlmApiKey"),
    ];

    for (query, variables, field) in operations {
        let response = app.graphql(query, variables, Auth::None).await;
        assert_eq!(response.error_code(), "UNAUTHORIZED", "{field}");
        assert_eq!(response.body["data"][field], Value::Null);
    }
}

#[tokio::test]
async fn one_users_keys_are_invisible_to_another() {
    let (app, token) = app_with_owner().await;
    save_named_key(&app, &token, "openai").await.data("saveLlmApiKey");
    seed_user(&app.db, "stranger").await;
    let stranger = app.access_token("stranger");

    let listed = app.graphql(LIST, json!({}), Auth::Bearer(&stranger)).await;
    let tested =
        app.graphql(TEST, json!({ "provider": "openai" }), Auth::Bearer(&stranger)).await;

    assert_eq!(listed.data("llmApiKeys"), &json!([]));
    assert_eq!(tested.error_code(), "AI_NOT_CONFIGURED");
}
