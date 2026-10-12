#![cfg(test)]

use std::sync::Arc;
use std::time::Duration;

use serde_json::{json, Value};

use crate::infrastructure::llm::openai_compatible::OpenAICompatibleLLMProvider;
use crate::infrastructure::llm::stub_server::{
    chunks, done, fast_transport, stream_error, text_delta, StubReply, StubServer,
};
use crate::use_cases::constants::llm;
use crate::use_cases::errors::{DomainError, ErrorCode, LlmProviderErrorKind};
use crate::use_cases::ports::llm_provider::{
    LLMProvider, LlmCompleteOptions, LlmMessage, LlmToolCall, LlmToolDefinition, LlmUsage,
};
use crate::use_cases::ports::outbound_url_policy::OutboundUrlPurpose;
use crate::use_cases::test_support::RecordingOutboundUrlPolicy;

const MODEL: &str = "example-model";
const PATH: &str = "/v1/chat/completions";

fn provider(server: &StubServer) -> OpenAICompatibleLLMProvider {
    OpenAICompatibleLLMProvider::new("secret-key", server.url(PATH), MODEL, None, fast_transport())
}

fn hi() -> Vec<LlmMessage> {
    vec![LlmMessage::user("hi")]
}

fn reply(content: &str) -> StubReply {
    StubReply::json(200, json!({ "choices": [{ "message": { "content": content } }] }))
}

fn sse(lines: &[&str]) -> StubReply {
    let body: String = lines.iter().map(|line| format!("data: {line}\n\n")).collect();
    StubReply::sse(&[&body])
}

async fn complete_body(max_tokens: Option<u32>, options: LlmCompleteOptions) -> Value {
    let server = StubServer::start(vec![reply("ok")]).await;
    provider(&server).complete(&hi(), max_tokens, options).await.unwrap();
    server.only_request().json()
}

async fn stream_body(
    messages: &[LlmMessage],
    tools: &[LlmToolDefinition],
    max_tokens: Option<u32>,
) -> Value {
    let server = StubServer::start(vec![sse(&["[DONE]"])]).await;
    chunks(provider(&server).complete_with_tools_stream(messages, tools, max_tokens)).await;
    server.only_request().json()
}

#[tokio::test]
async fn asks_the_policy_before_every_call_and_never_fetches_when_it_refuses() {
    let server = StubServer::start(vec![reply("ok")]).await;
    let policy = Arc::new(RecordingOutboundUrlPolicy::refuse_all());
    let url = server.url(PATH);
    let provider = OpenAICompatibleLLMProvider::new(
        "key",
        url.clone(),
        MODEL,
        Some(policy.clone()),
        fast_transport(),
    );

    let err = provider.complete(&hi(), None, LlmCompleteOptions::default()).await.unwrap_err();
    assert_eq!(err.code(), ErrorCode::Validation);
    let err = stream_error(provider.complete_with_tools_stream(&hi(), &[], None)).await;
    assert_eq!(err.code(), ErrorCode::Validation);

    assert_eq!(
        policy.checks(),
        vec![
            (url.clone(), OutboundUrlPurpose::LlmProvider),
            (url, OutboundUrlPurpose::LlmProvider)
        ]
    );
    assert_eq!(server.request_count(), 0);
}

#[tokio::test]
async fn proceeds_when_the_policy_allows_the_base_url() {
    let server = StubServer::start(vec![reply("ok")]).await;
    let policy = Arc::new(RecordingOutboundUrlPolicy::allow_all());
    let provider = OpenAICompatibleLLMProvider::new(
        "key",
        server.url(PATH),
        MODEL,
        Some(policy.clone()),
        fast_transport(),
    );

    provider.complete(&hi(), None, LlmCompleteOptions::default()).await.unwrap();

    assert_eq!(policy.checks(), vec![(server.url(PATH), OutboundUrlPurpose::LlmProvider)]);
    assert_eq!(server.request_count(), 1);
}

#[tokio::test]
async fn turns_a_non_2xx_response_into_a_coded_error_with_a_truncated_excerpt() {
    let page = format!("<html>{}</html>", "secret ".repeat(200));
    let server = StubServer::start(vec![StubReply::text(401, page)]).await;

    let err =
        provider(&server).complete(&hi(), None, LlmCompleteOptions::default()).await.unwrap_err();

    let failure = err.llm_provider_failure().unwrap();
    assert_eq!(failure.kind, LlmProviderErrorKind::Auth);
    assert_eq!(failure.status, Some(401));
    assert!(failure.detail.as_deref().unwrap().starts_with("<html>secret"));
    assert_eq!(err.code(), ErrorCode::AiProviderError);
    assert!(err.to_string().ends_with("(LLM provider error 401)"));
    assert!(!err.to_string().contains("secret"));
    assert_eq!(server.request_count(), 1);
}

#[tokio::test]
async fn fails_without_calling_out_when_the_api_key_is_empty() {
    let server = StubServer::start(vec![reply("ok")]).await;
    let provider =
        OpenAICompatibleLLMProvider::new("", server.url(PATH), MODEL, None, fast_transport());

    let err = provider.complete(&hi(), None, LlmCompleteOptions::default()).await.unwrap_err();
    assert!(matches!(err, DomainError::Internal(_)));
    assert!(err.to_string().contains("API key is not set"));

    let err = stream_error(provider.complete_with_tools_stream(&hi(), &[], None)).await;
    assert!(err.to_string().contains("API key is not set"));
    assert_eq!(server.request_count(), 0);
}

#[tokio::test]
async fn posts_to_the_base_url_with_a_bearer_header_model_and_messages() {
    let server = StubServer::start(vec![reply("ok")]).await;
    let messages = [LlmMessage::system("be helpful"), LlmMessage::user("hello")];

    provider(&server).complete(&messages, Some(256), LlmCompleteOptions::default()).await.unwrap();

    let sent = server.only_request();
    assert_eq!(sent.method, "POST");
    assert_eq!(sent.uri, PATH);
    assert_eq!(sent.header("authorization"), Some("Bearer secret-key"));
    assert_eq!(sent.header("content-type"), Some("application/json"));
    assert_eq!(
        sent.json(),
        json!({
            "model": MODEL,
            "messages": [
                { "role": "system", "content": "be helpful" },
                { "role": "user", "content": "hello" },
            ],
            "max_tokens": 256,
        })
    );
}

#[tokio::test]
async fn asks_for_json_mode_only_when_the_caller_opts_in() {
    let with = complete_body(None, LlmCompleteOptions { json: true }).await;
    let without = complete_body(None, LlmCompleteOptions::default()).await;
    assert_eq!(with["response_format"], json!({ "type": "json_object" }));
    assert!(without.get("response_format").is_none());
}

#[tokio::test]
async fn defaults_and_clamps_max_tokens() {
    let default = complete_body(None, LlmCompleteOptions::default()).await;
    let clamped = complete_body(Some(999_999), LlmCompleteOptions::default()).await;
    assert_eq!(default["max_tokens"], json!(512));
    assert_eq!(clamped["max_tokens"], json!(llm::MAX_OUTPUT_TOKENS_CAP));
}

#[tokio::test]
async fn returns_the_content_of_the_first_choice() {
    let server = StubServer::start(vec![reply("generated response")]).await;
    let result = provider(&server).complete(&hi(), None, LlmCompleteOptions::default()).await;
    let result = result.unwrap();
    assert_eq!(result.content, "generated response");
    assert_eq!(result.usage, None);
    assert!(!result.truncated);
}

#[tokio::test]
async fn returns_an_empty_string_when_choices_are_empty() {
    let server = StubServer::start(vec![StubReply::json(200, json!({ "choices": [] }))]).await;
    let result = provider(&server).complete(&hi(), None, LlmCompleteOptions::default()).await;
    assert_eq!(result.unwrap().content, "");
}

#[tokio::test]
async fn a_2xx_body_with_no_choices_at_all_is_an_internal_error() {
    let server = StubServer::start(vec![StubReply::json(200, json!({ "error": "odd" }))]).await;
    let err =
        provider(&server).complete(&hi(), None, LlmCompleteOptions::default()).await.unwrap_err();
    assert!(matches!(err, DomainError::Internal(_)));
}

#[tokio::test]
async fn parses_usage_and_keeps_the_cached_share_when_reported() {
    let server = StubServer::start(vec![
        StubReply::json(
            200,
            json!({
                "choices": [{ "message": { "content": "ok" } }],
                "usage": { "prompt_tokens": 80, "completion_tokens": 20 },
            }),
        ),
        StubReply::json(
            200,
            json!({
                "choices": [{ "message": { "content": "ok" } }],
                "usage": {
                    "prompt_tokens": 80,
                    "completion_tokens": 20,
                    "prompt_tokens_details": { "cached_tokens": 64 },
                },
            }),
        ),
    ])
    .await;
    let provider = provider(&server);

    let plain = provider.complete(&hi(), None, LlmCompleteOptions::default()).await.unwrap();
    let cached = provider.complete(&hi(), None, LlmCompleteOptions::default()).await.unwrap();

    let usage = LlmUsage {
        prompt_tokens: 80,
        completion_tokens: 20,
        cache_read_tokens: None,
        cache_write_tokens: None,
    };
    assert_eq!(plain.usage, Some(usage));
    assert_eq!(cached.usage, Some(LlmUsage { cache_read_tokens: Some(64), ..usage }));
}

#[tokio::test]
async fn flags_a_reply_the_backend_cut_off_at_the_output_budget() {
    let server = StubServer::start(vec![
        StubReply::json(
            200,
            json!({ "choices": [{ "message": { "content": "{\"a\":" }, "finish_reason": "length" }] }),
        ),
        StubReply::json(
            200,
            json!({ "choices": [{ "message": { "content": "ok" }, "finish_reason": "stop" }] }),
        ),
    ])
    .await;
    let provider = provider(&server);

    let cut = provider.complete(&hi(), None, LlmCompleteOptions::default()).await.unwrap();
    let whole = provider.complete(&hi(), None, LlmCompleteOptions::default()).await.unwrap();

    assert!(cut.truncated);
    assert!(!whole.truncated);
}

#[tokio::test]
async fn reports_a_429_as_rate_limited_without_retrying() {
    let server =
        StubServer::start(vec![StubReply::json(429, json!({ "error": "rate limited" }))]).await;
    let err =
        provider(&server).complete(&hi(), None, LlmCompleteOptions::default()).await.unwrap_err();
    assert!(err.to_string().contains("LLM provider error 429"));
    assert_eq!(err.llm_provider_failure().unwrap().kind, LlmProviderErrorKind::RateLimited);
    assert_eq!(server.request_count(), 1);
}

#[tokio::test]
async fn retries_a_transient_5xx_failure_and_succeeds() {
    let server = StubServer::start(vec![
        StubReply::json(503, json!({ "error": "unavailable" })),
        reply("ok after retry"),
    ])
    .await;
    let result = provider(&server).complete(&hi(), None, LlmCompleteOptions::default()).await;
    assert_eq!(result.unwrap().content, "ok after retry");
    assert_eq!(server.request_count(), 2);
}

#[tokio::test]
async fn reports_a_5xx_that_outlasts_the_retries_as_unavailable() {
    let server = StubServer::start(vec![StubReply::text(503, "down")]).await;
    let err =
        provider(&server).complete(&hi(), None, LlmCompleteOptions::default()).await.unwrap_err();
    assert_eq!(err.llm_provider_failure().unwrap().kind, LlmProviderErrorKind::Unavailable);
    assert_eq!(server.request_count(), (llm::MAX_RETRIES + 1) as usize);
}

#[tokio::test]
async fn does_not_follow_a_redirect_from_the_endpoint() {
    let server = StubServer::start(vec![StubReply::redirect(307, "/elsewhere"), reply("ok")]).await;
    let err =
        provider(&server).complete(&hi(), None, LlmCompleteOptions::default()).await.unwrap_err();
    assert_eq!(err.llm_provider_failure().unwrap().status, Some(307));
    assert_eq!(server.request_count(), 1);
}

#[tokio::test]
async fn dropping_a_completion_in_flight_aborts_the_request() {
    let server = StubServer::start(vec![StubReply::Hang]).await;
    let provider = provider(&server);

    let call = tokio::spawn(async move {
        let _ = provider.complete(&hi(), None, LlmCompleteOptions::default()).await;
    });
    server.wait_for_requests(1).await;
    call.abort();

    server.wait_for_abandoned(1).await;
}

#[tokio::test]
async fn the_stream_request_asks_for_streaming_usage_and_carries_the_tools() {
    let tools = [LlmToolDefinition::new(
        "list_applications",
        "List applications",
        json!({ "type": "object" }),
    )
    .with_cache_breakpoint()];
    let body = stream_body(&hi(), &tools, Some(999_999)).await;

    assert_eq!(
        body,
        json!({
            "model": MODEL,
            "messages": [{ "role": "user", "content": "hi" }],
            "max_tokens": llm::MAX_OUTPUT_TOKENS_CAP,
            "stream": true,
            "stream_options": { "include_usage": true },
            "tools": [{
                "type": "function",
                "function": {
                    "name": "list_applications",
                    "description": "List applications",
                    "parameters": { "type": "object" },
                },
            }],
        })
    );
}

#[tokio::test]
async fn the_stream_request_serializes_tool_calls_and_tool_results() {
    let messages = [
        LlmMessage::user("which apps?").with_cache_breakpoint(),
        LlmMessage::assistant_tool_calls(
            "",
            vec![LlmToolCall {
                id: "call_1".to_string(),
                name: "list_applications".to_string(),
                arguments: json!({ "status": "applied" }),
            }],
        ),
        LlmMessage::tool("call_1", "[]"),
        LlmMessage::assistant_tool_calls(
            "Checking",
            vec![LlmToolCall {
                id: "call_2".to_string(),
                name: "list_skills".to_string(),
                arguments: json!({}),
            }],
        ),
    ];
    let body = stream_body(&messages, &[], None).await;

    assert_eq!(
        body["messages"],
        json!([
            { "role": "user", "content": "which apps?" },
            {
                "role": "assistant",
                "content": null,
                "tool_calls": [{
                    "id": "call_1",
                    "type": "function",
                    "function": { "name": "list_applications", "arguments": "{\"status\":\"applied\"}" },
                }],
            },
            { "role": "tool", "tool_call_id": "call_1", "content": "[]" },
            {
                "role": "assistant",
                "content": "Checking",
                "tool_calls": [{
                    "id": "call_2",
                    "type": "function",
                    "function": { "name": "list_skills", "arguments": "{}" },
                }],
            },
        ])
    );
    assert_eq!(body["max_tokens"], json!(512));
    assert_eq!(body["tools"], json!([]));
}

#[tokio::test]
async fn nothing_is_sent_until_the_stream_is_polled() {
    let server = StubServer::start(vec![sse(&["[DONE]"])]).await;
    let stream = provider(&server).complete_with_tools_stream(&hi(), &[], None);
    tokio::time::sleep(Duration::from_millis(100)).await;
    assert_eq!(server.request_count(), 0);
    chunks(stream).await;
    assert_eq!(server.request_count(), 1);
}

#[tokio::test]
async fn yields_a_text_delta_per_chunk_and_a_final_done_stopping_at_done() {
    let server = StubServer::start(vec![sse(&[
        r#"{"choices":[{"delta":{"role":"assistant","content":"Hello"}}]}"#,
        r#"{"choices":[{"delta":{"content":" world"}}]}"#,
        r#"{"choices":[{"delta":{},"finish_reason":"stop"}]}"#,
        "[DONE]",
        r#"{"choices":[{"delta":{"content":" ignored"}}]}"#,
    ])])
    .await;

    let events = chunks(provider(&server).complete_with_tools_stream(&hi(), &[], None)).await;

    assert_eq!(
        events,
        vec![text_delta("Hello"), text_delta(" world"), done(Some("Hello world"), vec![], None)]
    );
}

#[tokio::test]
async fn parses_usage_from_the_final_choices_empty_chunk() {
    let server = StubServer::start(vec![sse(&[
        r#"{"choices":[{"delta":{"content":"hi"}}]}"#,
        r#"{"choices":[],"usage":{"prompt_tokens":30,"completion_tokens":5,"prompt_tokens_details":{"cached_tokens":8}}}"#,
        "[DONE]",
    ])])
    .await;

    let events = chunks(provider(&server).complete_with_tools_stream(&hi(), &[], None)).await;

    let usage = LlmUsage {
        prompt_tokens: 30,
        completion_tokens: 5,
        cache_read_tokens: Some(8),
        cache_write_tokens: None,
    };
    assert_eq!(events.last(), Some(&done(Some("hi"), vec![], Some(usage))));
}

#[tokio::test]
async fn reassembles_a_streamed_tool_call_from_per_index_delta_fragments() {
    let server = StubServer::start(vec![sse(&[
        r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"list_applications","arguments":""}}]}}]}"#,
        r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\"status\":"}}]}}]}"#,
        r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"applied\"}"}}]}}]}"#,
        r#"{"choices":[{"delta":{},"finish_reason":"tool_calls"}]}"#,
        "[DONE]",
    ])])
    .await;

    let events = chunks(provider(&server).complete_with_tools_stream(&hi(), &[], None)).await;

    assert_eq!(
        events,
        vec![done(
            None,
            vec![LlmToolCall {
                id: "call_1".to_string(),
                name: "list_applications".to_string(),
                arguments: json!({ "status": "applied" }),
            }],
            None
        )]
    );
}

#[tokio::test]
async fn assembles_parallel_tool_calls_interleaved_by_index() {
    let server = StubServer::start(vec![sse(&[
        r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"a","function":{"name":"one","arguments":"{\"x\""}},{"index":1,"id":"b","function":{"name":"two"}}]}}]}"#,
        r#"{"choices":[{"delta":{"tool_calls":[{"index":1,"function":{"arguments":"not json"}},{"index":0,"function":{"arguments":":1}"}}]}}]}"#,
        "[DONE]",
    ])])
    .await;

    let events = chunks(provider(&server).complete_with_tools_stream(&hi(), &[], None)).await;

    assert_eq!(
        events,
        vec![done(
            None,
            vec![
                LlmToolCall {
                    id: "a".to_string(),
                    name: "one".to_string(),
                    arguments: json!({ "x": 1 }),
                },
                // Arguments that do not parse become an empty object.
                LlmToolCall { id: "b".to_string(), name: "two".to_string(), arguments: json!({}) },
            ],
            None
        )]
    );
}

#[tokio::test]
async fn reassembles_events_split_mid_frame_across_network_chunks() {
    let server = StubServer::start(vec![StubReply::sse_spaced(
        &[
            "data: {\"choices\":[{\"delta\":{\"con",
            "tent\":\"Hel\"}}]}\n",
            "\ndata: {\"choices\":[{\"delta\":{\"content\":\"lo\"}}]}\r\n\r",
            "\ndata: [DONE]\n\n",
        ],
        Duration::from_millis(30),
    )])
    .await;

    let events = chunks(provider(&server).complete_with_tools_stream(&hi(), &[], None)).await;

    assert_eq!(
        events,
        vec![text_delta("Hel"), text_delta("lo"), done(Some("Hello"), vec![], None)]
    );
}

#[tokio::test]
async fn a_stream_that_ends_without_done_still_finishes() {
    let server =
        StubServer::start(vec![sse(&[r#"{"choices":[{"delta":{"content":"partial"}}]}"#])]).await;
    let events = chunks(provider(&server).complete_with_tools_stream(&hi(), &[], None)).await;
    assert_eq!(events, vec![text_delta("partial"), done(Some("partial"), vec![], None)]);
}

#[tokio::test]
async fn a_frame_that_is_not_json_fails_the_stream_after_what_was_already_delivered() {
    let server =
        StubServer::start(vec![sse(&[r#"{"choices":[{"delta":{"content":"hi"}}]}"#, "<html>"])])
            .await;

    let items: Vec<_> =
        futures::StreamExt::collect(provider(&server).complete_with_tools_stream(&hi(), &[], None))
            .await;

    assert_eq!(items.len(), 2);
    assert_eq!(items[0].as_ref().unwrap(), &text_delta("hi"));
    assert!(matches!(items[1], Err(DomainError::Internal(_))));
}

#[tokio::test]
async fn the_stream_fails_with_a_coded_error_when_the_response_is_not_ok() {
    let server = StubServer::start(vec![StubReply::text(429, "rate limited")]).await;
    let err = stream_error(provider(&server).complete_with_tools_stream(&hi(), &[], None)).await;
    assert!(err.to_string().contains("LLM provider error 429"));
    assert_eq!(err.llm_provider_failure().unwrap().detail.as_deref(), Some("rate limited"));
}

#[tokio::test]
async fn dropping_the_stream_closes_the_provider_connection() {
    let server = StubServer::start(vec![StubReply::sse_then_hang(&[
        "data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n\n",
    ])])
    .await;

    let mut stream = provider(&server).complete_with_tools_stream(&hi(), &[], None);
    let first = futures::StreamExt::next(&mut stream).await.unwrap().unwrap();
    assert_eq!(first, text_delta("Hello"));
    drop(stream);

    server.wait_for_abandoned(1).await;
}

#[tokio::test]
async fn a_stream_that_goes_quiet_fails_once_the_idle_window_passes() {
    let server = StubServer::start(vec![StubReply::sse_then_hang(&[
        "data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n\n",
    ])])
    .await;
    let mut transport = fast_transport();
    transport.stream_idle_timeout = Duration::from_millis(150);
    let provider =
        OpenAICompatibleLLMProvider::new("secret-key", server.url(PATH), MODEL, None, transport);

    let items: Vec<_> =
        futures::StreamExt::collect(provider.complete_with_tools_stream(&hi(), &[], None)).await;

    assert_eq!(items[0].as_ref().unwrap(), &text_delta("Hello"));
    assert!(matches!(items.last(), Some(Err(DomainError::Internal(_)))));
    assert_eq!(items.len(), 2);
}
