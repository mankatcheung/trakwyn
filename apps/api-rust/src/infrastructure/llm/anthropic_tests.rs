#![cfg(test)]

use std::time::Duration;

use serde_json::{json, Value};

use crate::infrastructure::llm::anthropic::AnthropicLLMProvider;
use crate::infrastructure::llm::stub_server::{
    chunks, done, fast_transport, stream_error, text_delta, StubReply, StubServer,
};
use crate::use_cases::constants::llm;
use crate::use_cases::errors::{DomainError, LlmProviderErrorKind};
use crate::use_cases::ports::llm_provider::{
    LLMProvider, LlmCompleteOptions, LlmMessage, LlmStreamChunk, LlmToolCall, LlmToolDefinition,
    LlmUsage,
};

const PATH: &str = "/v1/messages";
const MESSAGE_STOP: &str = "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n";

fn provider(server: &StubServer) -> AnthropicLLMProvider {
    AnthropicLLMProvider::new("secret-key", None, fast_transport()).with_api_url(server.url(PATH))
}

fn hi() -> Vec<LlmMessage> {
    vec![LlmMessage::user("hi")]
}

fn reply(text: &str) -> StubReply {
    StubReply::json(200, json!({ "content": [{ "type": "text", "text": text }] }))
}

/// An SSE body of `event:`/`data:` frames, one per JSON event, named by its `type`.
fn sse(events: &[&str]) -> StubReply {
    let body: String = events
        .iter()
        .map(|event| {
            let parsed: Value = serde_json::from_str(event).unwrap();
            format!("event: {}\ndata: {event}\n\n", parsed["type"].as_str().unwrap())
        })
        .collect();
    StubReply::sse(&[&body])
}

async fn complete_body(messages: &[LlmMessage], max_tokens: Option<u32>) -> Value {
    let server = StubServer::start(vec![reply("ok")]).await;
    provider(&server).complete(messages, max_tokens, LlmCompleteOptions::default()).await.unwrap();
    server.only_request().json()
}

async fn stream_body(messages: &[LlmMessage], tools: &[LlmToolDefinition]) -> Value {
    let server = StubServer::start(vec![StubReply::sse(&[MESSAGE_STOP])]).await;
    chunks(provider(&server).complete_with_tools_stream(messages, tools, None)).await;
    server.only_request().json()
}

fn tool_call(id: &str, name: &str, arguments: Value) -> LlmToolCall {
    LlmToolCall { id: id.to_string(), name: name.to_string(), arguments }
}

#[tokio::test]
async fn falls_back_to_the_default_model_and_uses_a_given_one() {
    let default = complete_body(&hi(), None).await;
    assert_eq!(default["model"], json!("claude-haiku-4-5"));

    let server = StubServer::start(vec![reply("ok")]).await;
    AnthropicLLMProvider::new("key", Some("claude-custom".to_string()), fast_transport())
        .with_api_url(server.url(PATH))
        .complete(&hi(), None, LlmCompleteOptions::default())
        .await
        .unwrap();
    assert_eq!(server.only_request().json()["model"], json!("claude-custom"));
}

#[tokio::test]
async fn fails_without_calling_out_when_the_api_key_is_empty() {
    let server = StubServer::start(vec![reply("ok")]).await;
    let provider =
        AnthropicLLMProvider::new("", None, fast_transport()).with_api_url(server.url(PATH));

    let err = provider.complete(&hi(), None, LlmCompleteOptions::default()).await.unwrap_err();
    assert!(matches!(err, DomainError::Internal(_)));
    assert!(err.to_string().contains("Anthropic API key is not set"));

    let err = stream_error(provider.complete_with_tools_stream(&hi(), &[], None)).await;
    assert!(err.to_string().contains("Anthropic API key is not set"));
    assert_eq!(server.request_count(), 0);
}

#[tokio::test]
async fn sends_the_api_key_and_version_as_headers() {
    let server = StubServer::start(vec![reply("ok")]).await;
    provider(&server).complete(&hi(), Some(256), LlmCompleteOptions::default()).await.unwrap();

    let sent = server.only_request();
    assert_eq!(sent.method, "POST");
    assert_eq!(sent.uri, PATH);
    assert_eq!(sent.header("x-api-key"), Some("secret-key"));
    assert_eq!(sent.header("anthropic-version"), Some("2023-06-01"));
    assert_eq!(sent.header("content-type"), Some("application/json"));
    assert_eq!(
        sent.json(),
        json!({
            "model": "claude-haiku-4-5",
            "max_tokens": 256,
            "messages": [{ "role": "user", "content": "hi" }],
        })
    );
}

#[tokio::test]
async fn moves_the_system_message_to_a_top_level_system_field() {
    let body = complete_body(
        &[
            LlmMessage::system("be helpful"),
            LlmMessage::user("hello"),
            LlmMessage::assistant("hi there"),
        ],
        None,
    )
    .await;

    assert_eq!(body["system"], json!("be helpful"));
    assert_eq!(
        body["messages"],
        json!([
            { "role": "user", "content": "hello" },
            { "role": "assistant", "content": "hi there" },
        ])
    );
}

#[tokio::test]
async fn joins_several_system_messages_and_omits_the_field_when_there_is_none() {
    let joined = complete_body(
        &[LlmMessage::system("one"), LlmMessage::system("two"), LlmMessage::user("x")],
        None,
    )
    .await;
    assert_eq!(joined["system"], json!("one\n\ntwo"));

    let none = complete_body(&hi(), None).await;
    assert!(none.get("system").is_none());
}

#[tokio::test]
async fn defaults_clamps_and_passes_through_max_tokens() {
    assert_eq!(complete_body(&hi(), None).await["max_tokens"], json!(512));
    assert_eq!(
        complete_body(&hi(), Some(999_999)).await["max_tokens"],
        json!(llm::MAX_OUTPUT_TOKENS_CAP)
    );
    assert_eq!(complete_body(&hi(), Some(1024)).await["max_tokens"], json!(1024));
}

#[tokio::test]
async fn ignores_the_json_option() {
    let server = StubServer::start(vec![reply("{}")]).await;
    provider(&server).complete(&hi(), None, LlmCompleteOptions { json: true }).await.unwrap();
    let body = server.only_request().json();
    assert_eq!(body.as_object().unwrap().len(), 3);
}

#[tokio::test]
async fn returns_the_text_of_the_first_text_content_block() {
    let server = StubServer::start(vec![StubReply::json(
        200,
        json!({ "content": [
            { "type": "thinking", "thinking": "hmm" },
            { "type": "text", "text": "generated response" },
            { "type": "text", "text": "second" },
        ] }),
    )])
    .await;
    let result = provider(&server).complete(&hi(), None, LlmCompleteOptions::default()).await;
    let result = result.unwrap();
    assert_eq!(result.content, "generated response");
    assert_eq!(result.usage, None);
    assert!(!result.truncated);
}

#[tokio::test]
async fn returns_an_empty_string_when_there_is_no_text_content_block() {
    let server = StubServer::start(vec![StubReply::json(200, json!({ "content": [] }))]).await;
    let result = provider(&server).complete(&hi(), None, LlmCompleteOptions::default()).await;
    assert_eq!(result.unwrap().content, "");
}

#[tokio::test]
async fn flags_a_reply_cut_off_by_max_tokens() {
    let server = StubServer::start(vec![StubReply::json(
        200,
        json!({ "content": [{ "type": "text", "text": "{\"a\":" }], "stop_reason": "max_tokens" }),
    )])
    .await;
    let result = provider(&server).complete(&hi(), None, LlmCompleteOptions::default()).await;
    assert!(result.unwrap().truncated);
}

#[tokio::test]
async fn parses_usage_folding_cache_tokens_into_prompt_tokens() {
    let server = StubServer::start(vec![StubReply::json(
        200,
        json!({
            "content": [{ "type": "text", "text": "ok" }],
            "usage": {
                "input_tokens": 100,
                "output_tokens": 40,
                "cache_creation_input_tokens": 10,
                "cache_read_input_tokens": 5,
            },
        }),
    )])
    .await;
    let result = provider(&server).complete(&hi(), None, LlmCompleteOptions::default()).await;
    assert_eq!(
        result.unwrap().usage,
        Some(LlmUsage {
            prompt_tokens: 115,
            completion_tokens: 40,
            cache_read_tokens: Some(5),
            cache_write_tokens: Some(10),
        })
    );
}

#[tokio::test]
async fn reports_a_non_2xx_response_with_the_provider_and_status() {
    let server =
        StubServer::start(vec![StubReply::json(429, json!({ "error": "rate limited" }))]).await;
    let err =
        provider(&server).complete(&hi(), None, LlmCompleteOptions::default()).await.unwrap_err();
    assert!(err.to_string().ends_with("(Anthropic error 429)"));
    assert_eq!(err.llm_provider_failure().unwrap().kind, LlmProviderErrorKind::RateLimited);
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
async fn does_not_retry_a_4xx_failure() {
    let server = StubServer::start(vec![StubReply::json(401, json!({ "error": "bad key" }))]).await;
    let err =
        provider(&server).complete(&hi(), None, LlmCompleteOptions::default()).await.unwrap_err();
    assert!(err.to_string().ends_with("(Anthropic error 401)"));
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
async fn switches_to_a_content_block_system_field_marking_only_the_cached_block() {
    let body = complete_body(
        &[
            LlmMessage::system("shared system prompt").with_cache_breakpoint(),
            LlmMessage::system("per-user custom prompt"),
            LlmMessage::user("hi"),
        ],
        None,
    )
    .await;

    assert_eq!(
        body["system"],
        json!([
            {
                "type": "text",
                "text": "shared system prompt",
                "cache_control": { "type": "ephemeral" },
            },
            { "type": "text", "text": "per-user custom prompt" },
        ])
    );
}

#[tokio::test]
async fn turns_a_cache_breakpoint_on_a_user_message_into_cache_control_on_its_text_block() {
    let body = stream_body(
        &[
            LlmMessage::user("earlier").with_cache_breakpoint(),
            LlmMessage::assistant("reply"),
            LlmMessage::user("now"),
        ],
        &[],
    )
    .await;

    assert_eq!(
        body["messages"],
        json!([
            {
                "role": "user",
                "content": [
                    { "type": "text", "text": "earlier", "cache_control": { "type": "ephemeral" } },
                ],
            },
            { "role": "assistant", "content": "reply" },
            { "role": "user", "content": "now" },
        ])
    );
}

#[tokio::test]
async fn attaches_cache_control_to_a_marked_tool_result_and_assistant_tool_use_turn() {
    let body = stream_body(
        &[
            LlmMessage::assistant_tool_calls(
                "Looking",
                vec![
                    tool_call("t1", "list_applications", json!({})),
                    tool_call("t2", "list_skills", json!({ "limit": 3 })),
                ],
            )
            .with_cache_breakpoint(),
            LlmMessage::tool("t1", "{}").with_cache_breakpoint(),
            LlmMessage::tool("t2", "[]"),
        ],
        &[],
    )
    .await;

    assert_eq!(
        body["messages"],
        json!([
            {
                "role": "assistant",
                "content": [
                    { "type": "text", "text": "Looking" },
                    { "type": "tool_use", "id": "t1", "name": "list_applications", "input": {} },
                    {
                        "type": "tool_use",
                        "id": "t2",
                        "name": "list_skills",
                        "input": { "limit": 3 },
                        "cache_control": { "type": "ephemeral" },
                    },
                ],
            },
            {
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": "t1",
                    "content": "{}",
                    "cache_control": { "type": "ephemeral" },
                }],
            },
            {
                "role": "user",
                "content": [{ "type": "tool_result", "tool_use_id": "t2", "content": "[]" }],
            },
        ])
    );
}

#[tokio::test]
async fn the_stream_request_carries_the_tools_and_marks_a_cached_one() {
    let tools = [
        LlmToolDefinition::new(
            "list_applications",
            "List applications",
            json!({ "type": "object" }),
        ),
        LlmToolDefinition::new("list_skills", "List skills", json!({ "type": "object" }))
            .with_cache_breakpoint(),
    ];
    let body =
        stream_body(&[LlmMessage::system("be helpful"), LlmMessage::user("hi")], &tools).await;

    assert_eq!(
        body,
        json!({
            "model": "claude-haiku-4-5",
            "max_tokens": 512,
            "stream": true,
            "system": "be helpful",
            "messages": [{ "role": "user", "content": "hi" }],
            "tools": [
                {
                    "name": "list_applications",
                    "description": "List applications",
                    "input_schema": { "type": "object" },
                },
                {
                    "name": "list_skills",
                    "description": "List skills",
                    "input_schema": { "type": "object" },
                    "cache_control": { "type": "ephemeral" },
                },
            ],
        })
    );
}

#[tokio::test]
async fn yields_a_text_delta_per_content_block_delta_and_a_final_done() {
    let server = StubServer::start(vec![sse(&[
        r#"{"type":"message_start"}"#,
        r#"{"type":"content_block_start","index":0,"content_block":{"type":"text"}}"#,
        r#"{"type":"ping"}"#,
        r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}"#,
        r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}"#,
        r#"{"type":"content_block_stop","index":0}"#,
        r#"{"type":"message_stop"}"#,
    ])])
    .await;

    let events = chunks(provider(&server).complete_with_tools_stream(&hi(), &[], None)).await;

    assert_eq!(
        events,
        vec![text_delta("Hello"), text_delta(" world"), done(Some("Hello world"), vec![], None)]
    );
}

#[tokio::test]
async fn parses_usage_from_message_start_and_message_delta() {
    let server = StubServer::start(vec![sse(&[
        r#"{"type":"message_start","message":{"usage":{"input_tokens":50,"output_tokens":1,"cache_read_input_tokens":20,"cache_creation_input_tokens":4}}}"#,
        r#"{"type":"content_block_start","index":0,"content_block":{"type":"text"}}"#,
        r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}"#,
        r#"{"type":"content_block_stop","index":0}"#,
        r#"{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":12}}"#,
        r#"{"type":"message_stop"}"#,
    ])])
    .await;

    let events = chunks(provider(&server).complete_with_tools_stream(&hi(), &[], None)).await;

    // Reported as soon as message_start arrives, so a dropped stream can
    // still be charged for the prompt the provider already billed.
    assert_eq!(events[0], LlmStreamChunk::PromptUsage { prompt_tokens: 74 });
    assert_eq!(
        events.last(),
        Some(&done(
            Some("hi"),
            vec![],
            Some(LlmUsage {
                prompt_tokens: 74,
                completion_tokens: 12,
                cache_read_tokens: Some(20),
                cache_write_tokens: Some(4),
            })
        ))
    );
}

#[tokio::test]
async fn usage_is_absent_unless_both_halves_arrived() {
    let server = StubServer::start(vec![sse(&[
        r#"{"type":"message_start","message":{"usage":{"input_tokens":50,"output_tokens":1}}}"#,
        r#"{"type":"message_stop"}"#,
    ])])
    .await;

    let events = chunks(provider(&server).complete_with_tools_stream(&hi(), &[], None)).await;

    assert_eq!(
        events,
        vec![LlmStreamChunk::PromptUsage { prompt_tokens: 50 }, done(None, vec![], None)]
    );
}

#[tokio::test]
async fn completes_a_stream_that_outlasts_the_idle_window_while_chunks_keep_arriving() {
    let frames = [
        "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\"}}\n\n",
        "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"a\"}}\n\n",
        "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"b\"}}\n\n",
        MESSAGE_STOP,
    ];
    // Each gap is inside the idle window; their sum is well past it.
    let server =
        StubServer::start(vec![StubReply::sse_spaced(&frames, Duration::from_millis(120))]).await;
    let mut transport = fast_transport();
    transport.stream_idle_timeout = Duration::from_millis(300);
    transport.request_timeout = Duration::from_millis(300);
    let provider =
        AnthropicLLMProvider::new("secret-key", None, transport).with_api_url(server.url(PATH));

    let events = chunks(provider.complete_with_tools_stream(&hi(), &[], None)).await;

    assert_eq!(events, vec![text_delta("a"), text_delta("b"), done(Some("ab"), vec![], None)]);
}

#[tokio::test]
async fn reassembles_a_streamed_tool_call_from_input_json_delta_fragments() {
    let server = StubServer::start(vec![sse(&[
        r#"{"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_1","name":"list_applications"}}"#,
        r#"{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\"status\":"}}"#,
        r#"{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\"applied\"}"}}"#,
        r#"{"type":"content_block_stop","index":0}"#,
        r#"{"type":"message_stop"}"#,
    ])])
    .await;

    let events = chunks(provider(&server).complete_with_tools_stream(&hi(), &[], None)).await;

    assert_eq!(
        events,
        vec![done(
            None,
            vec![tool_call("toolu_1", "list_applications", json!({ "status": "applied" }))],
            None
        )]
    );
}

#[tokio::test]
async fn keeps_interleaved_text_and_tool_blocks_apart_by_index() {
    let server = StubServer::start(vec![sse(&[
        r#"{"type":"content_block_start","index":0,"content_block":{"type":"text"}}"#,
        r#"{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_1","name":"list_skills"}}"#,
        r#"{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"limit\""}}"#,
        r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Checking"}}"#,
        r#"{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":":3}"}}"#,
        r#"{"type":"content_block_delta","index":7,"delta":{"type":"text_delta","text":"orphan"}}"#,
        r#"{"type":"content_block_start","index":2,"content_block":{"type":"tool_use","id":"toolu_2","name":"list_notes"}}"#,
        r#"{"type":"message_stop"}"#,
    ])])
    .await;

    let events = chunks(provider(&server).complete_with_tools_stream(&hi(), &[], None)).await;

    assert_eq!(
        events,
        vec![
            text_delta("Checking"),
            done(
                Some("Checking"),
                vec![
                    tool_call("toolu_1", "list_skills", json!({ "limit": 3 })),
                    // No argument fragments at all parses as an empty object.
                    tool_call("toolu_2", "list_notes", json!({})),
                ],
                None
            ),
        ]
    );
}

#[tokio::test]
async fn reassembles_events_split_mid_frame_across_network_chunks() {
    let server = StubServer::start(vec![StubReply::sse_spaced(
        &[
            "event: content_block_start\r\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_bl",
            "ock\":{\"type\":\"text\"}}\r\n\r\nevent: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"caf",
            "\u{e9}\"}}\n",
            "\n",
        ],
        Duration::from_millis(30),
    )])
    .await;

    let events = chunks(provider(&server).complete_with_tools_stream(&hi(), &[], None)).await;

    assert_eq!(events, vec![text_delta("caf\u{e9}"), done(Some("caf\u{e9}"), vec![], None)]);
}

#[tokio::test]
async fn fails_on_a_stream_error_event_without_showing_the_provider_text() {
    let server = StubServer::start(vec![sse(&[
        r#"{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}"#,
    ])])
    .await;

    let err = stream_error(provider(&server).complete_with_tools_stream(&hi(), &[], None)).await;

    assert!(matches!(err, DomainError::Internal(_)));
    assert!(err.to_string().contains("Anthropic stream error: Overloaded"));
}

#[tokio::test]
async fn the_stream_fails_with_a_coded_error_when_the_response_is_not_ok() {
    let server = StubServer::start(vec![StubReply::text(429, "rate limited")]).await;
    let err = stream_error(provider(&server).complete_with_tools_stream(&hi(), &[], None)).await;
    assert!(err.to_string().ends_with("(Anthropic error 429)"));
}

#[tokio::test]
async fn dropping_the_stream_closes_the_provider_connection() {
    let server = StubServer::start(vec![StubReply::sse_then_hang(&[
        "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"usage\":{\"input_tokens\":9,\"output_tokens\":1}}}\n\n",
    ])])
    .await;

    let mut stream = provider(&server).complete_with_tools_stream(&hi(), &[], None);
    let first = futures::StreamExt::next(&mut stream).await.unwrap().unwrap();
    assert_eq!(first, LlmStreamChunk::PromptUsage { prompt_tokens: 9 });
    drop(stream);

    server.wait_for_abandoned(1).await;
}
