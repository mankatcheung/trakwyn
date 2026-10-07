use std::collections::HashMap;

use async_stream::try_stream;
use async_trait::async_trait;
use serde::Serialize;
use serde_json::{Map, Value};

use crate::infrastructure::llm::fetch_with_retry::{LlmRequest, LlmTransport};
use crate::infrastructure::llm::wire::{
    boxed, clamp_max_tokens, optional_token_count, parse_frame_json, str_field, token_count,
    usage_object,
};
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::llm_provider::{
    LLMProvider, LlmCompleteOptions, LlmCompleteResult, LlmCompletionResult, LlmMessage, LlmRole,
    LlmStream, LlmStreamChunk, LlmToolCall, LlmToolDefinition, LlmUsage,
};

const API_URL: &str = "https://generativelanguage.googleapis.com/v1beta/models";
/// 2.5 Flash: the first Flash tier eligible for Gemini's implicit prompt
/// caching. 2.0 was not, whatever the request did.
const DEFAULT_MODEL: &str = "gemini-2.5-flash";
const API_KEY_HEADER: &str = "x-goog-api-key";
const PROVIDER_LABEL: &str = "Google AI";
const JSON_MIME_TYPE: &str = "application/json";

#[derive(Serialize)]
struct WireRequest<'a> {
    contents: Vec<WireContent<'a>>,
    #[serde(rename = "systemInstruction", skip_serializing_if = "Option::is_none")]
    system_instruction: Option<WireSystemInstruction>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<[WireTools<'a>; 1]>,
    #[serde(rename = "generationConfig")]
    generation_config: WireGenerationConfig,
}

#[derive(Serialize)]
struct WireSystemInstruction {
    parts: [WireTextPart; 1],
}

#[derive(Serialize)]
struct WireTextPart {
    text: String,
}

#[derive(Serialize)]
struct WireContent<'a> {
    role: &'a str,
    parts: Vec<WirePart<'a>>,
}

#[derive(Serialize)]
enum WirePart<'a> {
    #[serde(rename = "text")]
    Text(&'a str),
    #[serde(rename = "functionCall")]
    FunctionCall { name: &'a str, args: &'a Value },
    #[serde(rename = "functionResponse")]
    FunctionResponse { name: &'a str, response: WireFunctionResult<'a> },
}

#[derive(Serialize)]
struct WireFunctionResult<'a> {
    content: &'a str,
}

#[derive(Serialize)]
struct WireTools<'a> {
    #[serde(rename = "functionDeclarations")]
    function_declarations: Vec<WireFunctionDeclaration<'a>>,
}

#[derive(Serialize)]
struct WireFunctionDeclaration<'a> {
    name: &'a str,
    description: &'a str,
    parameters: &'a Value,
}

#[derive(Serialize)]
struct WireGenerationConfig {
    #[serde(rename = "maxOutputTokens")]
    max_output_tokens: u32,
    #[serde(rename = "responseMimeType", skip_serializing_if = "Option::is_none")]
    response_mime_type: Option<&'static str>,
}

/// Gemini takes system text as a top-level field, never as a content role.
fn split_system(messages: &[LlmMessage]) -> (Option<WireSystemInstruction>, Vec<&LlmMessage>) {
    let (system_messages, conversation): (Vec<_>, Vec<_>) =
        messages.iter().partition(|message| message.role == LlmRole::System);
    let text = system_messages
        .iter()
        .map(|message| message.content.as_str())
        .collect::<Vec<_>>()
        .join("\n\n");
    let instruction =
        (!text.is_empty()).then_some(WireSystemInstruction { parts: [WireTextPart { text }] });
    (instruction, conversation)
}

fn to_wire_content<'a>(
    message: &'a LlmMessage,
    id_to_name: &HashMap<&'a str, &'a str>,
) -> WireContent<'a> {
    if message.role == LlmRole::Tool {
        let call_id = message.tool_call_id.as_deref().unwrap_or_default();
        let name = id_to_name.get(call_id).copied().unwrap_or(call_id);
        return WireContent {
            role: "function",
            parts: vec![WirePart::FunctionResponse {
                name,
                response: WireFunctionResult { content: &message.content },
            }],
        };
    }
    if message.role == LlmRole::Assistant && !message.tool_calls.is_empty() {
        return WireContent {
            role: "model",
            parts: message
                .tool_calls
                .iter()
                .map(|call| WirePart::FunctionCall { name: &call.name, args: &call.arguments })
                .collect(),
        };
    }
    WireContent {
        role: if message.role == LlmRole::Assistant { "model" } else { message.role.as_str() },
        parts: vec![WirePart::Text(&message.content)],
    }
}

fn to_llm_usage(usage: Option<&Value>) -> Option<LlmUsage> {
    let usage = usage_object(usage)?;
    Some(LlmUsage {
        prompt_tokens: token_count(usage.get("promptTokenCount")),
        completion_tokens: token_count(usage.get("candidatesTokenCount")),
        // Prompt tokens served from Gemini's cache; part of promptTokenCount.
        cache_read_tokens: optional_token_count(usage.get("cachedContentTokenCount")),
        cache_write_tokens: None,
    })
}

fn first_candidate(response: &Value) -> Option<&Value> {
    response.get("candidates").and_then(|candidates| candidates.get(0))
}

fn candidate_parts(response: &Value) -> &[Value] {
    first_candidate(response)
        .and_then(|candidate| candidate.get("content"))
        .and_then(|content| content.get("parts"))
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default()
}

/// No prompt-caching wiring here, unlike Anthropic's explicit
/// `cache_control`: Gemini's implicit caching applies on its own to 2.5+
/// models once the prefix is long enough, and `cachedContentTokenCount` is
/// recorded so whether it hits is visible in the usage summary. Its explicit
/// caching (a named `CachedContents` resource with its own lifecycle) would
/// be a feature to build, not a flag to set.
#[derive(Clone)]
pub struct GoogleAILLMProvider {
    api_key: String,
    model: String,
    api_url: String,
    transport: LlmTransport,
}

impl GoogleAILLMProvider {
    /// `model` is the user's override; `None` means the default model.
    pub fn new(api_key: impl Into<String>, model: Option<String>, transport: LlmTransport) -> Self {
        Self {
            api_key: api_key.into(),
            model: model.unwrap_or_else(|| DEFAULT_MODEL.to_string()),
            api_url: API_URL.to_string(),
            transport,
        }
    }

    /// Points the adapter at another `…/models` base (a local stub in tests).
    pub fn with_api_url(mut self, api_url: impl Into<String>) -> Self {
        self.api_url = api_url.into();
        self
    }

    fn assert_ready(&self) -> DomainResult<()> {
        if self.api_key.is_empty() {
            return Err(DomainError::internal("Google AI API key is not set"));
        }
        Ok(())
    }

    /// The key travels in a header, never the query string: request spans,
    /// proxy access logs and error causes all keep the URL verbatim. The
    /// model id is validated on the way in, so it cannot re-target the path.
    fn request(&self, method: &str, body: String) -> LlmRequest {
        LlmRequest {
            url: format!("{}/{}:{method}", self.api_url, self.model),
            headers: vec![(API_KEY_HEADER, self.api_key.clone())],
            body,
        }
    }
}

#[async_trait]
impl LLMProvider for GoogleAILLMProvider {
    async fn complete(
        &self,
        messages: &[LlmMessage],
        max_tokens: Option<u32>,
        options: LlmCompleteOptions,
    ) -> DomainResult<LlmCompleteResult> {
        self.assert_ready()?;

        // `contents[].role` is `user` or `model` only; system text is the
        // top-level `systemInstruction`.
        let (system_instruction, conversation) = split_system(messages);
        let body = serde_json::to_string(&WireRequest {
            contents: conversation
                .iter()
                .map(|message| WireContent {
                    role: if message.role == LlmRole::Assistant { "model" } else { "user" },
                    parts: vec![WirePart::Text(&message.content)],
                })
                .collect(),
            system_instruction,
            tools: None,
            generation_config: WireGenerationConfig {
                max_output_tokens: clamp_max_tokens(max_tokens),
                // Gemini's JSON mode: the reply is a bare JSON document, never fenced.
                response_mime_type: options.json.then_some(JSON_MIME_TYPE),
            },
        })
        .map_err(DomainError::internal)?;

        let json = self
            .transport
            .post_json(&self.request("generateContent", body), PROVIDER_LABEL)
            .await?;

        Ok(LlmCompleteResult {
            content: candidate_parts(&json)
                .first()
                .and_then(|part| str_field(part, "text"))
                .unwrap_or_default()
                .to_string(),
            usage: to_llm_usage(json.get("usageMetadata")),
            truncated: first_candidate(&json)
                .and_then(|candidate| str_field(candidate, "finishReason"))
                == Some("MAX_TOKENS"),
        })
    }

    /// Streams via `:streamGenerateContent?alt=sse`. Each SSE frame is a
    /// whole `GenerateContentResponse`: text parts carry the next slice of
    /// the reply, `functionCall` parts arrive complete in one frame, and
    /// `usageMetadata` on the final frame is the cumulative count.
    fn complete_with_tools_stream(
        &self,
        messages: &[LlmMessage],
        tools: &[LlmToolDefinition],
        max_tokens: Option<u32>,
    ) -> LlmStream {
        let provider = self.clone();
        let (system_instruction, conversation) = split_system(messages);

        // Gemini's functionResponse is keyed by function name, not an opaque
        // call id, so the name is recovered from the assistant message that
        // requested the call.
        let mut id_to_name = HashMap::new();
        for message in messages.iter().filter(|message| message.role == LlmRole::Assistant) {
            for call in &message.tool_calls {
                id_to_name.insert(call.id.as_str(), call.name.as_str());
            }
        }

        let body = serde_json::to_string(&WireRequest {
            contents: conversation
                .iter()
                .map(|message| to_wire_content(message, &id_to_name))
                .collect(),
            system_instruction,
            tools: Some([WireTools {
                function_declarations: tools
                    .iter()
                    .map(|tool| WireFunctionDeclaration {
                        name: &tool.name,
                        description: &tool.description,
                        parameters: &tool.parameters,
                    })
                    .collect(),
            }]),
            generation_config: WireGenerationConfig {
                max_output_tokens: clamp_max_tokens(max_tokens),
                response_mime_type: None,
            },
        });

        boxed(try_stream! {
            provider.assert_ready()?;
            let request =
                provider.request("streamGenerateContent?alt=sse", body.map_err(DomainError::internal)?);
            let mut sse = provider.transport.post_stream(&request, PROVIDER_LABEL).await?;

            let mut text = String::new();
            let mut tool_calls: Vec<LlmToolCall> = Vec::new();
            let mut usage: Option<LlmUsage> = None;

            while let Some(frames) = sse.next_frames().await? {
                for frame in frames {
                    let chunk = parse_frame_json(&frame.data)?;
                    if let Some(reported) = to_llm_usage(chunk.get("usageMetadata")) {
                        usage = Some(reported);
                    }
                    for part in candidate_parts(&chunk) {
                        if let Some(piece) = str_field(part, "text").filter(|piece| !piece.is_empty()) {
                            text.push_str(piece);
                            yield LlmStreamChunk::TextDelta { text: piece.to_string() };
                        }
                        if let Some(call) = part.get("functionCall").filter(|call| call.is_object()) {
                            let name = str_field(call, "name").unwrap_or_default();
                            tool_calls.push(LlmToolCall {
                                id: format!("{name}-{}", tool_calls.len()),
                                name: name.to_string(),
                                arguments: call
                                    .get("args")
                                    .filter(|args| !args.is_null())
                                    .cloned()
                                    .unwrap_or_else(|| Value::Object(Map::new())),
                            });
                        }
                    }
                }
            }
            drop(sse);

            yield LlmStreamChunk::Done(LlmCompletionResult {
                content: (!text.is_empty()).then_some(text),
                tool_calls,
                usage,
            });
        })
    }
}
