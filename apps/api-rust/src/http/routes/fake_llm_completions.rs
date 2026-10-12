//! A same-origin stand-in for a real OpenAI-compatible `/chat/completions`
//! endpoint, to be mounted only when `LLM_PROVIDER_MODE=fake`
//! (`config::llm::LlmProviderModeConfig`).
//!
//! Not a new provider type on the backend or a new option in Settings → AI's
//! provider dropdown: an e2e test (or a developer) points the existing
//! "Custom (OpenAI-compatible)" provider's own base URL here, the same real
//! mechanism self-hosted endpoints already use in production.
//!
//! Two canned response shapes, chosen by whether the request carries
//! `tools`. Present means a chat request (always streamed): the reply is an
//! SSE-framed stream with plain text and no tool calls, which ends the
//! tool-use loop after one round. Absent means a `complete` call: a resume
//! that passes resume generation's schema and grounds every company and
//! institution against the user's own stored profile, so it only works
//! together with a test that creates matching work-experience and education
//! fixtures first.

use axum::body::Bytes;
use axum::http::header::CONTENT_TYPE;
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use axum::{Json, Router};
use serde_json::{json, Value};

use crate::http::constants::llm_fake_completions;

const FAKE_CHAT_REPLY: &str = "Fake assistant reply for e2e testing.";
const EVENT_STREAM: &str = "text/event-stream";

/// The OpenAI streaming chunk shape the OpenAI-compatible adapter parses:
/// one delta chunk carrying the whole canned reply, then a finish chunk,
/// then the `[DONE]` sentinel. Sent as one body rather than in pieces: the
/// consuming parser only cares that the bytes form valid SSE frames, not how
/// many reads they arrived in.
fn fake_chat_stream_body(content: &str) -> String {
    let delta_chunk =
        json!({ "choices": [{ "delta": { "role": "assistant", "content": content } }] });
    let finish_chunk = json!({ "choices": [{ "delta": {}, "finish_reason": "stop" }] });
    format!("data: {delta_chunk}\n\ndata: {finish_chunk}\n\ndata: [DONE]\n\n")
}

/// The canned resume, as the JSON text of the completion's `content`.
fn fake_resume() -> String {
    json!({
        "summary": "Experienced engineer.",
        "experience": [{
            "company": "Acme Corp",
            "title": "Senior Engineer",
            "period": "2020 - Present",
            "bullets": ["Built things."]
        }],
        "education": [{
            "institution": "State University",
            "qualification": "BS Computer Science",
            "period": "2016 - 2020"
        }],
        "skills": [{ "category": "Languages", "items": ["TypeScript"] }]
    })
    .to_string()
}

/// JavaScript truthiness of a JSON value: what `if (body?.tools)` tests.
fn is_truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(flag) => *flag,
        Value::Number(number) => number.as_f64().is_some_and(|number| number != 0.0),
        Value::String(text) => !text.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

async fn fake_llm_completions(body: Bytes) -> Response {
    let body: Value = serde_json::from_slice(&body).unwrap_or(Value::Null);
    if body.get("tools").is_some_and(is_truthy) {
        return ([(CONTENT_TYPE, EVENT_STREAM)], fake_chat_stream_body(FAKE_CHAT_REPLY))
            .into_response();
    }

    Json(json!({ "choices": [{ "message": { "content": fake_resume(), "tool_calls": [] } }] }))
        .into_response()
}

/// The route, for `build_router` to merge when the provider mode is fake.
pub fn fake_llm_completions_routes<S: Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new().route(llm_fake_completions::PATH, post(fake_llm_completions))
}

#[cfg(test)]
mod tests {
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    use super::*;

    async fn post_body(body: &str) -> (StatusCode, Option<String>, String) {
        let router: Router = fake_llm_completions_routes();
        let request = Request::post("/llm-test/fake/chat/completions")
            .header(CONTENT_TYPE, "application/json")
            .body(Body::from(body.to_string()))
            .unwrap();
        let response = router.oneshot(request).await.unwrap();
        let status = response.status();
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        (status, content_type, String::from_utf8(bytes.to_vec()).unwrap())
    }

    #[tokio::test]
    async fn a_request_without_tools_gets_the_canned_resume_as_a_completion() {
        let (status, content_type, body) =
            post_body(r#"{"model":"fake","messages":[{"role":"user","content":"hi"}]}"#).await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(content_type.as_deref(), Some("application/json"));
        let body: Value = serde_json::from_str(&body).unwrap();
        assert_eq!(body["choices"][0]["message"]["tool_calls"], json!([]));
        let resume: Value =
            serde_json::from_str(body["choices"][0]["message"]["content"].as_str().unwrap())
                .unwrap();
        assert_eq!(resume["summary"], "Experienced engineer.");
        assert_eq!(resume["experience"][0]["company"], "Acme Corp");
        assert_eq!(resume["education"][0]["institution"], "State University");
        assert_eq!(resume["skills"][0]["items"], json!(["TypeScript"]));
    }

    #[tokio::test]
    async fn a_request_with_tools_gets_one_sse_framed_text_reply() {
        let (status, content_type, body) =
            post_body(r#"{"model":"fake","stream":true,"tools":[{"type":"function"}]}"#).await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(content_type.as_deref(), Some("text/event-stream"));
        let frames: Vec<&str> = body.split("\n\n").filter(|frame| !frame.is_empty()).collect();
        assert_eq!(frames.len(), 3);
        let delta: Value = serde_json::from_str(frames[0].strip_prefix("data: ").unwrap()).unwrap();
        assert_eq!(
            delta,
            json!({ "choices": [{ "delta": { "role": "assistant", "content": "Fake assistant reply for e2e testing." } }] })
        );
        let finish: Value =
            serde_json::from_str(frames[1].strip_prefix("data: ").unwrap()).unwrap();
        assert_eq!(finish, json!({ "choices": [{ "delta": {}, "finish_reason": "stop" }] }));
        assert_eq!(frames[2], "data: [DONE]");
        assert!(body.ends_with("\n\n"));
    }

    #[tokio::test]
    async fn an_empty_tools_list_still_counts_as_a_chat_request() {
        let (_, content_type, _) = post_body(r#"{"tools":[]}"#).await;

        assert_eq!(content_type.as_deref(), Some("text/event-stream"));
    }

    #[tokio::test]
    async fn a_null_tools_field_or_an_unreadable_body_gets_the_completion() {
        for body in [r#"{"tools":null}"#, "", "not json"] {
            let (status, content_type, _) = post_body(body).await;

            assert_eq!(status, StatusCode::OK, "{body:?}");
            assert_eq!(content_type.as_deref(), Some("application/json"));
        }
    }
}
