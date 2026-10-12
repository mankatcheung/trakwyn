use std::sync::Arc;

use async_stream::try_stream;
use async_trait::async_trait;
use serde::Serialize;
use serde_json::Value;

use crate::infrastructure::llm::fetch_with_retry::{LlmRequest, LlmTransport};
use crate::infrastructure::llm::wire::{
    boxed, clamp_max_tokens, optional_token_count, parse_frame_json, parse_tool_arguments,
    str_field, token_count, usage_object,
};
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::llm_provider::{
    LLMProvider, LlmCompleteOptions, LlmCompleteResult, LlmCompletionResult, LlmMessage, LlmRole,
    LlmStream, LlmStreamChunk, LlmToolCall, LlmToolDefinition, LlmUsage,
};
use crate::use_cases::ports::outbound_url_policy::{OutboundUrlPolicy, OutboundUrlPurpose};

const AUTHORIZATION_HEADER: &str = "authorization";
const BEARER_PREFIX: &str = "Bearer ";
/// How this provider is named in a failure message. Deliberately generic:
/// the same adapter serves a dozen vendors and any custom endpoint.
const PROVIDER_LABEL: &str = "LLM provider";
const STREAM_DONE: &str = "[DONE]";

#[derive(Serialize)]
struct WireRequest<'a> {
    model: &'a str,
    messages: Vec<WireMessage<'a>>,
    max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    response_format: Option<WireResponseFormat>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream_options: Option<WireStreamOptions>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<WireTool<'a>>>,
}

#[derive(Serialize)]
struct WireResponseFormat {
    #[serde(rename = "type")]
    kind: &'static str,
}

#[derive(Serialize)]
struct WireStreamOptions {
    include_usage: bool,
}

#[derive(Serialize)]
struct WireMessage<'a> {
    role: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<&'a str>,
    content: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<WireToolCall<'a>>>,
}

#[derive(Serialize)]
struct WireToolCall<'a> {
    id: &'a str,
    #[serde(rename = "type")]
    kind: &'static str,
    function: WireFunctionCall<'a>,
}

#[derive(Serialize)]
struct WireFunctionCall<'a> {
    name: &'a str,
    /// The arguments object, serialized to a JSON string.
    arguments: String,
}

#[derive(Serialize)]
struct WireTool<'a> {
    #[serde(rename = "type")]
    kind: &'static str,
    function: WireFunction<'a>,
}

#[derive(Serialize)]
struct WireFunction<'a> {
    name: &'a str,
    description: &'a str,
    parameters: &'a Value,
}

fn to_wire_messages(messages: &[LlmMessage]) -> Vec<WireMessage<'_>> {
    messages
        .iter()
        .map(|message| {
            if message.role == LlmRole::Tool {
                return WireMessage {
                    role: "tool",
                    tool_call_id: message.tool_call_id.as_deref(),
                    content: Some(&message.content),
                    tool_calls: None,
                };
            }
            if message.role == LlmRole::Assistant && !message.tool_calls.is_empty() {
                return WireMessage {
                    role: "assistant",
                    tool_call_id: None,
                    content: (!message.content.is_empty()).then_some(message.content.as_str()),
                    tool_calls: Some(
                        message
                            .tool_calls
                            .iter()
                            .map(|call| WireToolCall {
                                id: &call.id,
                                kind: "function",
                                function: WireFunctionCall {
                                    name: &call.name,
                                    arguments: call.arguments.to_string(),
                                },
                            })
                            .collect(),
                    ),
                };
            }
            WireMessage {
                role: message.role.as_str(),
                tool_call_id: None,
                content: Some(&message.content),
                tool_calls: None,
            }
        })
        .collect()
}

fn to_llm_usage(usage: Option<&Value>) -> Option<LlmUsage> {
    let usage = usage_object(usage)?;
    // OpenAI reports automatic prefix-cache hits here; most compatible backends omit it.
    let cached =
        usage.get("prompt_tokens_details").and_then(|details| details.get("cached_tokens"));
    Some(LlmUsage {
        prompt_tokens: token_count(usage.get("prompt_tokens")),
        completion_tokens: token_count(usage.get("completion_tokens")),
        cache_read_tokens: optional_token_count(cached),
        cache_write_tokens: None,
    })
}

/// A tool call being assembled from `delta.tool_calls` fragments.
#[derive(Default)]
struct PartialToolCall {
    id: String,
    name: String,
    arguments: String,
}

/// Covers every provider that implements OpenAI's `/chat/completions`
/// request and response shape: OpenAI itself, OpenRouter, Mistral, Groq,
/// xAI, DeepSeek, NVIDIA and any user-supplied custom endpoint. Only the
/// endpoint URL and default model differ between them, which the caller
/// supplies.
///
/// Unlike [`super::anthropic::AnthropicLLMProvider`], this sets no explicit
/// cache control. OpenAI applies prompt caching automatically to any prompt
/// whose prefix repeats byte for byte across calls, and callers already put
/// the stable part (system prompt, tools) first.
#[derive(Clone)]
pub struct OpenAICompatibleLLMProvider {
    api_key: String,
    base_url: String,
    model: String,
    outbound_url_policy: Option<Arc<dyn OutboundUrlPolicy>>,
    transport: LlmTransport,
}

impl OpenAICompatibleLLMProvider {
    /// `base_url` is the full `/chat/completions` endpoint.
    ///
    /// `outbound_url_policy` is set only for the "Custom" provider, whose
    /// URL the user typed: the vendor endpoints are fixed constants and need
    /// no check. It runs on every call, not just at save time, because the
    /// name a user saved can be re-pointed at a private address afterwards.
    pub fn new(
        api_key: impl Into<String>,
        base_url: impl Into<String>,
        model: impl Into<String>,
        outbound_url_policy: Option<Arc<dyn OutboundUrlPolicy>>,
        transport: LlmTransport,
    ) -> Self {
        Self {
            api_key: api_key.into(),
            base_url: base_url.into(),
            model: model.into(),
            outbound_url_policy,
            transport,
        }
    }

    /// The checks that precede every call: a key is present, and the
    /// endpoint is still one the server may connect to.
    async fn assert_ready(&self) -> DomainResult<()> {
        if self.api_key.is_empty() {
            return Err(DomainError::internal("API key is not set"));
        }
        if let Some(policy) = &self.outbound_url_policy {
            policy.assert_allowed(&self.base_url, OutboundUrlPurpose::LlmProvider).await?;
        }
        Ok(())
    }

    fn request(&self, body: String) -> LlmRequest {
        LlmRequest {
            url: self.base_url.clone(),
            headers: vec![(AUTHORIZATION_HEADER, format!("{BEARER_PREFIX}{}", self.api_key))],
            body,
        }
    }
}

#[async_trait]
impl LLMProvider for OpenAICompatibleLLMProvider {
    async fn complete(
        &self,
        messages: &[LlmMessage],
        max_tokens: Option<u32>,
        options: LlmCompleteOptions,
    ) -> DomainResult<LlmCompleteResult> {
        self.assert_ready().await?;

        let body = serde_json::to_string(&WireRequest {
            model: &self.model,
            messages: to_wire_messages(messages),
            max_tokens: clamp_max_tokens(max_tokens),
            // OpenAI's JSON mode; requires the word "JSON" in the prompt,
            // which every caller that asks for it already has. Compatible
            // backends that do not know the field ignore it.
            response_format: options.json.then_some(WireResponseFormat { kind: "json_object" }),
            stream: None,
            stream_options: None,
            tools: None,
        })
        .map_err(DomainError::internal)?;

        let json = self.transport.post_json(&self.request(body), PROVIDER_LABEL).await?;

        let first = json
            .get("choices")
            .and_then(Value::as_array)
            .ok_or_else(|| DomainError::internal("LLM provider response had no choices"))?
            .first();
        Ok(LlmCompleteResult {
            content: first
                .and_then(|choice| choice.get("message"))
                .and_then(|message| str_field(message, "content"))
                .unwrap_or_default()
                .to_string(),
            usage: to_llm_usage(json.get("usage")),
            truncated: first.and_then(|choice| str_field(choice, "finish_reason"))
                == Some("length"),
        })
    }

    fn complete_with_tools_stream(
        &self,
        messages: &[LlmMessage],
        tools: &[LlmToolDefinition],
        max_tokens: Option<u32>,
    ) -> LlmStream {
        let provider = self.clone();
        let body = serde_json::to_string(&WireRequest {
            model: &self.model,
            messages: to_wire_messages(messages),
            max_tokens: clamp_max_tokens(max_tokens),
            response_format: None,
            stream: Some(true),
            stream_options: Some(WireStreamOptions { include_usage: true }),
            tools: Some(
                tools
                    .iter()
                    .map(|tool| WireTool {
                        kind: "function",
                        function: WireFunction {
                            name: &tool.name,
                            description: &tool.description,
                            parameters: &tool.parameters,
                        },
                    })
                    .collect(),
            ),
        });

        boxed(try_stream! {
            provider.assert_ready().await?;
            let request = provider.request(body.map_err(DomainError::internal)?);
            let mut sse = provider.transport.post_stream(&request, PROVIDER_LABEL).await?;

            let mut content = String::new();
            // Keyed by `index` (parallel tool calls), in order of first appearance.
            let mut tool_calls: Vec<(Option<i64>, PartialToolCall)> = Vec::new();
            let mut usage: Option<LlmUsage> = None;

            'read: while let Some(frames) = sse.next_frames().await? {
                for frame in frames {
                    if frame.data == STREAM_DONE {
                        break 'read;
                    }

                    let chunk = parse_frame_json(&frame.data)?;
                    // The usage-bearing final chunk has empty `choices`, so
                    // it is read independently of the delta handling below.
                    if let Some(reported) = to_llm_usage(chunk.get("usage")) {
                        usage = Some(reported);
                    }

                    let Some(delta) = chunk
                        .get("choices")
                        .and_then(|choices| choices.get(0))
                        .and_then(|choice| choice.get("delta"))
                        .filter(|delta| delta.is_object())
                    else {
                        continue;
                    };

                    if let Some(text) = str_field(delta, "content").filter(|text| !text.is_empty()) {
                        content.push_str(text);
                        yield LlmStreamChunk::TextDelta { text: text.to_string() };
                    }

                    // `id` and `function.name` usually arrive once, on a
                    // call's first fragment, and later fragments carry only
                    // more `function.arguments`. Whichever fields are present
                    // are merged rather than assuming that ordering.
                    let fragments = delta.get("tool_calls").and_then(Value::as_array);
                    for fragment in fragments.into_iter().flatten() {
                        let index = optional_token_count(fragment.get("index"));
                        let position = match tool_calls.iter().position(|(key, _)| *key == index) {
                            Some(position) => position,
                            None => {
                                tool_calls.push((index, PartialToolCall::default()));
                                tool_calls.len() - 1
                            }
                        };
                        let call = &mut tool_calls[position].1;
                        let function = fragment.get("function");
                        if let Some(id) = str_field(fragment, "id") {
                            call.id = id.to_string();
                        }
                        if let Some(name) = function.and_then(|function| str_field(function, "name")) {
                            call.name = name.to_string();
                        }
                        if let Some(arguments) =
                            function.and_then(|function| str_field(function, "arguments"))
                        {
                            call.arguments.push_str(arguments);
                        }
                    }
                }
            }
            drop(sse);

            yield LlmStreamChunk::Done(LlmCompletionResult {
                content: (!content.is_empty()).then_some(content),
                tool_calls: tool_calls
                    .into_iter()
                    .map(|(_, call)| LlmToolCall {
                        id: call.id,
                        name: call.name,
                        arguments: parse_tool_arguments(&call.arguments),
                    })
                    .collect(),
                usage,
            });
        })
    }
}
