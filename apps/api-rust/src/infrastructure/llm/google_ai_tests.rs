#![cfg(test)]

use std::time::Duration;

use serde_json::{json, Value};

use crate::infrastructure::llm::google_ai::GoogleAILLMProvider;
use crate::infrastructure::llm::stub_server::{
    chunks, done, fast_transport, stream_error, text_delta, StubReply, StubServer,
};
use crate::use_cases::constants::llm;
use crate::use_cases::errors::{DomainError, LlmProviderErrorKind};
use crate::use_cases::ports::llm_provider::{
    LLMProvider, LlmCompleteOptions, LlmMessage, LlmToolCall, LlmToolDefinition, LlmUsage,
};

const BASE: &str = "/v1beta/models";

fn provider(server: &StubServer) -> GoogleAILLMProvider {
    GoogleAILLMProvider::new("secret-key", None, fast_transport()).with_api_url(server.url(BASE))
}

fn hi() -> Vec<LlmMessage> {
    vec![LlmMessage::user("hi")]
}

fn text_response(text: &str) -> Value {
    json!({ "candidates": [{ "content": { "parts": [{ "text": text }] } }] })
}

fn reply(text: &str) -> StubReply {
    StubReply::json(200, text_response(text))
}

/// One SSE frame per `GenerateContentResponse`.
fn sse(responses: &[Value]) -> StubReply {
    let body: String =
        responses.iter().map(|response| format!("data: {response}\r\n\r\n")).collect();
    StubReply::sse(&[&body])
}

fn tools() -> Vec<LlmToolDefinition> {
    vec![LlmToolDefinition::new(
        "list_applications",
        "List applications",
        json!({ "type": "object" }),
    )]
}

fn tool_call(id: &str, name: &str, arguments: Value) -> LlmToolCall {
    LlmToolCall { id: id.to_string(), name: name.to_string(), arguments }
}

async fn complete_body(
    messages: &[LlmMessage],
    max_tokens: Option<u32>,
    options: LlmCompleteOptions,
) -> Value {
    let server = StubServer::start(vec![reply("ok")]).await;
    provider(&server).complete(messages, max_tokens, options).await.unwrap();
    server.only_request().json()
}

async fn stream_body(
    messages: &[LlmMessage],
    tools: &[LlmToolDefinition],
    max_tokens: Option<u32>,
) -> Value {
    let server = StubServer::start(vec![sse(&[text_response("ok")])]).await;
    chunks(provider(&server).complete_with_tools_stream(messages, tools, max_tokens)).await;
    server.only_request().json()
}

#[tokio::test]
async fn uses_the_default_model_or_the_given_one_in_the_path() {
    let server = StubServer::start(vec![reply("ok")]).await;
    provider(&server).complete(&hi(), None, LlmCompleteOptions::default()).await.unwrap();
    assert_eq!(server.only_request().uri, "/v1beta/models/gemini-2.5-flash:generateContent");

    let server = StubServer::start(vec![reply("ok")]).await;
    GoogleAILLMProvider::new("key", Some("gemini-custom".to_string()), fast_transport())
        .with_api_url(server.url(BASE))
        .complete(&hi(), None, LlmCompleteOptions::default())
        .await
        .unwrap();
    assert_eq!(server.only_request().uri, "/v1beta/models/gemini-custom:generateContent");
}

#[tokio::test]
async fn fails_without_calling_out_when_the_api_key_is_empty() {
    let server = StubServer::start(vec![reply("ok")]).await;
    let provider =
        GoogleAILLMProvider::new("", None, fast_transport()).with_api_url(server.url(BASE));

    let err = provider.complete(&hi(), None, LlmCompleteOptions::default()).await.unwrap_err();
    assert!(matches!(err, DomainError::Internal(_)));
    assert!(err.to_string().contains("Google AI API key is not set"));

    let err = stream_error(provider.complete_with_tools_stream(&hi(), &[], None)).await;
    assert!(err.to_string().contains("Google AI API key is not set"));
    assert_eq!(server.request_count(), 0);
}

#[tokio::test]
async fn sends_the_api_key_as_a_header_never_in_the_url_and_the_messages_as_contents() {
    let server = StubServer::start(vec![reply("ok")]).await;
    let messages = [
        LlmMessage::system("be helpful"),
        LlmMessage::user("hello"),
        LlmMessage::assistant("hi there"),
    ];

    provider(&server).complete(&messages, Some(256), LlmCompleteOptions::default()).await.unwrap();

    let sent = server.only_request();
    // Request spans and proxy logs record the URL verbatim, so the secret
    // must not be part of it.
    assert!(!sent.uri.contains("secret-key"));
    assert_eq!(sent.header("x-goog-api-key"), Some("secret-key"));
    assert_eq!(sent.header("content-type"), Some("application/json"));
    assert_eq!(sent.method, "POST");
    // `contents[].role` is user|model only; system text goes in the
    // top-level systemInstruction.
    assert_eq!(
        sent.json(),
        json!({
            "contents": [
                { "role": "user", "parts": [{ "text": "hello" }] },
                { "role": "model", "parts": [{ "text": "hi there" }] },
            ],
            "systemInstruction": { "parts": [{ "text": "be helpful" }] },
            "generationConfig": { "maxOutputTokens": 256 },
        })
    );
}

#[tokio::test]
async fn omits_system_instruction_when_there_is_no_system_message() {
    let body =
        complete_body(&[LlmMessage::user("hello")], None, LlmCompleteOptions::default()).await;
    assert!(body.get("systemInstruction").is_none());
    assert_eq!(body["contents"], json!([{ "role": "user", "parts": [{ "text": "hello" }] }]));
}

#[tokio::test]
async fn asks_for_a_json_reply_only_when_the_caller_opts_in() {
    let with = complete_body(&hi(), None, LlmCompleteOptions { json: true }).await;
    let without = complete_body(&hi(), None, LlmCompleteOptions::default()).await;
    assert_eq!(
        with["generationConfig"],
        json!({ "maxOutputTokens": 512, "responseMimeType": "application/json" })
    );
    assert_eq!(without["generationConfig"], json!({ "maxOutputTokens": 512 }));
}

#[tokio::test]
async fn clamps_a_max_tokens_request_above_the_hard_ceiling() {
    let body = complete_body(&hi(), Some(999_999), LlmCompleteOptions::default()).await;
    assert_eq!(body["generationConfig"], json!({ "maxOutputTokens": llm::MAX_OUTPUT_TOKENS_CAP }));
}

#[tokio::test]
async fn returns_the_text_from_the_first_candidate() {
    let server = StubServer::start(vec![reply("generated response")]).await;
    let result = provider(&server).complete(&hi(), None, LlmCompleteOptions::default()).await;
    let result = result.unwrap();
    assert_eq!(result.content, "generated response");
    assert_eq!(result.usage, None);
    assert!(!result.truncated);
}

#[tokio::test]
async fn returns_an_empty_string_when_candidates_are_missing() {
    let server = StubServer::start(vec![StubReply::json(200, json!({}))]).await;
    let result = provider(&server).complete(&hi(), None, LlmCompleteOptions::default()).await;
    assert_eq!(result.unwrap().content, "");
}

#[tokio::test]
async fn flags_a_reply_cut_off_by_max_tokens() {
    let server = StubServer::start(vec![StubReply::json(
        200,
        json!({ "candidates": [{
            "content": { "parts": [{ "text": "{\"a\":" }] },
            "finishReason": "MAX_TOKENS",
        }] }),
    )])
    .await;
    let result = provider(&server).complete(&hi(), None, LlmCompleteOptions::default()).await;
    assert!(result.unwrap().truncated);
}

#[tokio::test]
async fn parses_usage_and_keeps_the_cached_share_when_gemini_reports_it() {
    let with_usage = |usage: Value| {
        let mut response = text_response("ok");
        response["usageMetadata"] = usage;
        StubReply::json(200, response)
    };
    let server = StubServer::start(vec![
        with_usage(json!({ "promptTokenCount": 60, "candidatesTokenCount": 15 })),
        with_usage(json!({
            "promptTokenCount": 60,
            "candidatesTokenCount": 15,
            "cachedContentTokenCount": 40,
        })),
    ])
    .await;
    let provider = provider(&server);

    let plain = provider.complete(&hi(), None, LlmCompleteOptions::default()).await.unwrap();
    let cached = provider.complete(&hi(), None, LlmCompleteOptions::default()).await.unwrap();

    let usage = LlmUsage {
        prompt_tokens: 60,
        completion_tokens: 15,
        cache_read_tokens: None,
        cache_write_tokens: None,
    };
    assert_eq!(plain.usage, Some(usage));
    assert_eq!(cached.usage, Some(LlmUsage { cache_read_tokens: Some(40), ..usage }));
}

#[tokio::test]
async fn reports_a_non_2xx_response_with_the_provider_and_status() {
    let server =
        StubServer::start(vec![StubReply::json(429, json!({ "error": "quota exceeded" }))]).await;
    let err =
        provider(&server).complete(&hi(), None, LlmCompleteOptions::default()).await.unwrap_err();
    assert!(err.to_string().ends_with("(Google AI error 429)"));
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
    assert!(err.to_string().ends_with("(Google AI error 401)"));
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
async fn the_stream_request_has_the_gemini_shape() {
    let body = stream_body(
        &[LlmMessage::system("be helpful"), LlmMessage::user("hello")],
        &tools(),
        Some(999_999),
    )
    .await;

    assert_eq!(
        body,
        json!({
            "contents": [{ "role": "user", "parts": [{ "text": "hello" }] }],
            "systemInstruction": { "parts": [{ "text": "be helpful" }] },
            "tools": [{
                "functionDeclarations": [{
                    "name": "list_applications",
                    "description": "List applications",
                    "parameters": { "type": "object" },
                }],
            }],
            "generationConfig": { "maxOutputTokens": llm::MAX_OUTPUT_TOKENS_CAP },
        })
    );
}

#[tokio::test]
async fn the_stream_request_sends_an_empty_declaration_list_when_there_are_no_tools() {
    let body = stream_body(&hi(), &[], None).await;
    assert_eq!(body["tools"], json!([{ "functionDeclarations": [] }]));
    assert_eq!(body["generationConfig"], json!({ "maxOutputTokens": 512 }));
}

#[tokio::test]
async fn serializes_a_tool_call_as_a_model_function_call_and_its_result_by_function_name() {
    let messages = [
        LlmMessage::user("which apps need follow up?"),
        LlmMessage::assistant_tool_calls(
            "dropped text",
            vec![tool_call(
                "list_applications-0",
                "list_applications",
                json!({ "status": "applied" }),
            )],
        ),
        LlmMessage::tool("list_applications-0", "[]"),
        LlmMessage::tool("unknown-id", "{}"),
        LlmMessage::assistant("All done"),
    ];
    let body = stream_body(&messages, &tools(), None).await;

    assert_eq!(
        body["contents"],
        json!([
            { "role": "user", "parts": [{ "text": "which apps need follow up?" }] },
            {
                "role": "model",
                "parts": [{ "functionCall": { "name": "list_applications", "args": { "status": "applied" } } }],
            },
            {
                "role": "function",
                "parts": [{ "functionResponse": { "name": "list_applications", "response": { "content": "[]" } } }],
            },
            // A result whose call is not in the history falls back to its id.
            {
                "role": "function",
                "parts": [{ "functionResponse": { "name": "unknown-id", "response": { "content": "{}" } } }],
            },
            { "role": "model", "parts": [{ "text": "All done" }] },
        ])
    );
}

#[tokio::test]
async fn posts_to_stream_generate_content_and_yields_a_text_delta_per_chunk_then_done() {
    let server = StubServer::start(vec![sse(&[
        text_response("Hel"),
        text_response("lo"),
        json!({
            "candidates": [{ "content": { "parts": [] }, "finishReason": "STOP" }],
            "usageMetadata": { "promptTokenCount": 12, "candidatesTokenCount": 3 },
        }),
    ])])
    .await;

    let events = chunks(provider(&server).complete_with_tools_stream(&hi(), &[], None)).await;

    let sent = server.only_request();
    assert_eq!(sent.uri, "/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse");
    assert_eq!(sent.header("x-goog-api-key"), Some("secret-key"));
    assert_eq!(
        events,
        vec![
            text_delta("Hel"),
            text_delta("lo"),
            done(
                Some("Hello"),
                vec![],
                Some(LlmUsage {
                    prompt_tokens: 12,
                    completion_tokens: 3,
                    cache_read_tokens: None,
                    cache_write_tokens: None,
                })
            ),
        ]
    );
}

#[tokio::test]
async fn parses_a_function_call_part_from_the_response() {
    let server = StubServer::start(vec![sse(&[json!({
        "candidates": [{ "content": { "parts": [
            { "functionCall": { "name": "list_applications", "args": { "status": "applied" } } },
        ] } }],
    })])])
    .await;

    let events = chunks(provider(&server).complete_with_tools_stream(&hi(), &tools(), None)).await;

    assert_eq!(
        events,
        vec![done(
            None,
            vec![tool_call(
                "list_applications-0",
                "list_applications",
                json!({ "status": "applied" })
            )],
            None
        )]
    );
}

#[tokio::test]
async fn collects_function_calls_that_arrive_mid_stream_and_numbers_their_ids() {
    let server = StubServer::start(vec![sse(&[
        text_response("Checking…"),
        json!({ "candidates": [{ "content": { "parts": [
            { "functionCall": { "name": "list_skills" } },
            { "functionCall": { "name": "list_skills", "args": { "limit": 2 } } },
        ] } }] }),
    ])])
    .await;

    let events = chunks(provider(&server).complete_with_tools_stream(&hi(), &[], None)).await;

    assert_eq!(
        events.last(),
        Some(&done(
            Some("Checking…"),
            vec![
                tool_call("list_skills-0", "list_skills", json!({})),
                tool_call("list_skills-1", "list_skills", json!({ "limit": 2 })),
            ],
            None
        ))
    );
}

#[tokio::test]
async fn reassembles_frames_split_across_network_chunks() {
    let server = StubServer::start(vec![StubReply::sse_spaced(
        &[
            "data: {\"candidates\":[{\"content\":{\"parts\":[{\"te",
            "xt\":\"Hel\"}]}}]}\r\n\r",
            "\ndata: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"lo\"}]}}]}\n\n",
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
async fn the_stream_fails_with_a_coded_error_on_a_non_2xx_response() {
    let server = StubServer::start(vec![StubReply::text(429, "{\"error\":\"quota\"}")]).await;
    let err = stream_error(provider(&server).complete_with_tools_stream(&hi(), &[], None)).await;
    assert!(err.to_string().ends_with("(Google AI error 429)"));
    assert_eq!(
        err.llm_provider_failure().unwrap().detail.as_deref(),
        Some("{\"error\":\"quota\"}")
    );
}

#[tokio::test]
async fn dropping_the_stream_closes_the_provider_connection() {
    let frame = format!("data: {}\n\n", text_response("Hel"));
    let server = StubServer::start(vec![StubReply::sse_then_hang(&[&frame])]).await;

    let mut stream = provider(&server).complete_with_tools_stream(&hi(), &[], None);
    let first = futures::StreamExt::next(&mut stream).await.unwrap().unwrap();
    assert_eq!(first, text_delta("Hel"));
    drop(stream);

    server.wait_for_abandoned(1).await;
}
