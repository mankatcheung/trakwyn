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

const API_URL: &str = "https://api.anthropic.com/v1/messages";
/// Haiku 4.5. Haiku 3.5 was cheaper per token than it looked: its prompt
/// cache needs a 2 048-token prefix and the chat's tools + system block sits
/// right at that floor, so the `cache_control` marker was often a no-op.
const DEFAULT_MODEL: &str = "claude-haiku-4-5";
const API_VERSION: &str = "2023-06-01";
const API_KEY_HEADER: &str = "x-api-key";
const API_VERSION_HEADER: &str = "anthropic-version";
const PROVIDER_LABEL: &str = "Anthropic";

#[derive(Serialize, Clone, Copy)]
struct CacheControl {
    #[serde(rename = "type")]
    kind: &'static str,
}

const EPHEMERAL: CacheControl = CacheControl { kind: "ephemeral" };

fn cache_control(breakpoint: bool) -> Option<CacheControl> {
    breakpoint.then_some(EPHEMERAL)
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ContentBlock<'a> {
    Text {
        text: &'a str,
        #[serde(skip_serializing_if = "Option::is_none")]
        cache_control: Option<CacheControl>,
    },
    ToolUse {
        id: &'a str,
        name: &'a str,
        input: &'a Value,
        #[serde(skip_serializing_if = "Option::is_none")]
        cache_control: Option<CacheControl>,
    },
    ToolResult {
        tool_use_id: &'a str,
        content: &'a str,
        #[serde(skip_serializing_if = "Option::is_none")]
        cache_control: Option<CacheControl>,
    },
}

impl ContentBlock<'_> {
    fn mark_cached(&mut self) {
        match self {
            Self::Text { cache_control, .. }
            | Self::ToolUse { cache_control, .. }
            | Self::ToolResult { cache_control, .. } => *cache_control = Some(EPHEMERAL),
        }
    }
}

#[derive(Serialize)]
#[serde(untagged)]
enum Content<'a> {
    Text(&'a str),
    Blocks(Vec<ContentBlock<'a>>),
}

#[derive(Serialize)]
struct WireMessage<'a> {
    role: &'a str,
    content: Content<'a>,
}

#[derive(Serialize)]
#[serde(untagged)]
enum System<'a> {
    Text(String),
    Blocks(Vec<ContentBlock<'a>>),
}

#[derive(Serialize)]
struct WireTool<'a> {
    name: &'a str,
    description: &'a str,
    input_schema: &'a Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    cache_control: Option<CacheControl>,
}

#[derive(Serialize)]
struct WireRequest<'a> {
    model: &'a str,
    max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<System<'a>>,
    messages: Vec<WireMessage<'a>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<WireTool<'a>>>,
}

/// Anthropic's Messages API takes the system prompt as a separate top-level
/// field rather than a message with role "system".
fn split_system(messages: &[LlmMessage]) -> (Option<System<'_>>, Vec<&LlmMessage>) {
    let (system_messages, conversation): (Vec<_>, Vec<_>) =
        messages.iter().partition(|message| message.role == LlmRole::System);

    // Only switch to the content-block form when a cache breakpoint is in
    // use, so every caller that does not ask for caching keeps the bare
    // string shape.
    let system = if system_messages.iter().any(|message| message.cache_breakpoint) {
        Some(System::Blocks(
            system_messages
                .iter()
                .map(|message| ContentBlock::Text {
                    text: &message.content,
                    cache_control: cache_control(message.cache_breakpoint),
                })
                .collect(),
        ))
    } else {
        let joined = system_messages
            .iter()
            .map(|message| message.content.as_str())
            .collect::<Vec<_>>()
            .join("\n\n");
        (!joined.is_empty()).then_some(System::Text(joined))
    };

    (system, conversation)
}

fn with_cache_control(
    mut blocks: Vec<ContentBlock<'_>>,
    breakpoint: bool,
) -> Vec<ContentBlock<'_>> {
    if breakpoint {
        if let Some(last) = blocks.last_mut() {
            last.mark_cached();
        }
    }
    blocks
}

/// A `cache_breakpoint` on a conversation message becomes `cache_control` on
/// that message's last content block. The prefix up to it (tools, system,
/// every earlier turn and tool result) is then a cache read on the next
/// call, which is what makes a multi-iteration tool loop and a long
/// conversation affordable. An unmarked message keeps the bare-string shape.
fn to_wire_messages<'a>(messages: &[&'a LlmMessage]) -> Vec<WireMessage<'a>> {
    messages
        .iter()
        .map(|message| {
            if message.role == LlmRole::Tool {
                let blocks = vec![ContentBlock::ToolResult {
                    tool_use_id: message.tool_call_id.as_deref().unwrap_or_default(),
                    content: &message.content,
                    cache_control: None,
                }];
                return WireMessage {
                    role: "user",
                    content: Content::Blocks(with_cache_control(blocks, message.cache_breakpoint)),
                };
            }
            if message.role == LlmRole::Assistant && !message.tool_calls.is_empty() {
                let mut blocks = Vec::new();
                if !message.content.is_empty() {
                    blocks.push(ContentBlock::Text { text: &message.content, cache_control: None });
                }
                blocks.extend(message.tool_calls.iter().map(|call| ContentBlock::ToolUse {
                    id: &call.id,
                    name: &call.name,
                    input: &call.arguments,
                    cache_control: None,
                }));
                return WireMessage {
                    role: "assistant",
                    content: Content::Blocks(with_cache_control(blocks, message.cache_breakpoint)),
                };
            }
            let content = if message.cache_breakpoint {
                Content::Blocks(vec![ContentBlock::Text {
                    text: &message.content,
                    cache_control: Some(EPHEMERAL),
                }])
            } else {
                Content::Text(&message.content)
            };
            WireMessage { role: message.role.as_str(), content }
        })
        .collect()
}

fn to_llm_usage(usage: Option<&Value>) -> Option<LlmUsage> {
    let usage = usage_object(usage)?;
    let cache_read = token_count(usage.get("cache_read_input_tokens"));
    let cache_write = token_count(usage.get("cache_creation_input_tokens"));
    Some(LlmUsage {
        prompt_tokens: token_count(usage.get("input_tokens")) + cache_write + cache_read,
        completion_tokens: token_count(usage.get("output_tokens")),
        cache_read_tokens: Some(cache_read),
        cache_write_tokens: Some(cache_write),
    })
}

/// A content block being assembled from stream events.
enum StreamBlock {
    Text(String),
    ToolUse { id: String, name: String, json: String },
}

#[derive(Clone)]
pub struct AnthropicLLMProvider {
    api_key: String,
    model: String,
    api_url: String,
    transport: LlmTransport,
}

impl AnthropicLLMProvider {
    /// `model` is the user's override; `None` means the default model.
    pub fn new(api_key: impl Into<String>, model: Option<String>, transport: LlmTransport) -> Self {
        Self {
            api_key: api_key.into(),
            model: model.unwrap_or_else(|| DEFAULT_MODEL.to_string()),
            api_url: API_URL.to_string(),
            transport,
        }
    }

    /// Points the adapter at another Messages endpoint (a local stub in tests).
    pub fn with_api_url(mut self, api_url: impl Into<String>) -> Self {
        self.api_url = api_url.into();
        self
    }

    fn assert_ready(&self) -> DomainResult<()> {
        if self.api_key.is_empty() {
            return Err(DomainError::internal("Anthropic API key is not set"));
        }
        Ok(())
    }

    fn request(&self, body: String) -> LlmRequest {
        LlmRequest {
            url: self.api_url.clone(),
            headers: vec![
                (API_KEY_HEADER, self.api_key.clone()),
                (API_VERSION_HEADER, API_VERSION.to_string()),
            ],
            body,
        }
    }
}

#[async_trait]
impl LLMProvider for AnthropicLLMProvider {
    /// `options.json` is accepted and ignored: Anthropic's structured
    /// outputs need a schema, not a flag, and the prompt-level "return only
    /// JSON" already covers Claude.
    async fn complete(
        &self,
        messages: &[LlmMessage],
        max_tokens: Option<u32>,
        _options: LlmCompleteOptions,
    ) -> DomainResult<LlmCompleteResult> {
        self.assert_ready()?;

        let (system, conversation) = split_system(messages);
        let body = serde_json::to_string(&WireRequest {
            model: &self.model,
            max_tokens: clamp_max_tokens(max_tokens),
            stream: None,
            system,
            messages: conversation
                .iter()
                .map(|message| WireMessage {
                    role: message.role.as_str(),
                    content: Content::Text(&message.content),
                })
                .collect(),
            tools: None,
        })
        .map_err(DomainError::internal)?;

        let json = self.transport.post_json(&self.request(body), PROVIDER_LABEL).await?;

        let text = json
            .get("content")
            .and_then(Value::as_array)
            .and_then(|blocks| blocks.iter().find(|block| str_field(block, "type") == Some("text")))
            .and_then(|block| str_field(block, "text"))
            .unwrap_or_default();
        Ok(LlmCompleteResult {
            content: text.to_string(),
            usage: to_llm_usage(json.get("usage")),
            truncated: str_field(&json, "stop_reason") == Some("max_tokens"),
        })
    }

    fn complete_with_tools_stream(
        &self,
        messages: &[LlmMessage],
        tools: &[LlmToolDefinition],
        max_tokens: Option<u32>,
    ) -> LlmStream {
        let provider = self.clone();
        let (system, conversation) = split_system(messages);
        let body = serde_json::to_string(&WireRequest {
            model: &self.model,
            max_tokens: clamp_max_tokens(max_tokens),
            stream: Some(true),
            system,
            messages: to_wire_messages(&conversation),
            tools: Some(
                tools
                    .iter()
                    .map(|tool| WireTool {
                        name: &tool.name,
                        description: &tool.description,
                        input_schema: &tool.parameters,
                        cache_control: cache_control(tool.cache_breakpoint),
                    })
                    .collect(),
            ),
        });

        boxed(try_stream! {
            provider.assert_ready()?;
            let request = provider.request(body.map_err(DomainError::internal)?);
            let mut sse = provider.transport.post_stream(&request, PROVIDER_LABEL).await?;

            // Content blocks arrive by index. Text and tool_use can
            // interleave in principle, so each index accumulates on its own.
            // Tool arguments stream as raw partial-JSON fragments, which are
            // concatenated and parsed once at the end.
            let mut blocks: Vec<(i64, StreamBlock)> = Vec::new();
            // Input tokens (cache included) arrive once on message_start;
            // the final, cumulative output count arrives on message_delta.
            let mut prompt_usage: Option<LlmUsage> = None;
            let mut completion_tokens: Option<i64> = None;

            while let Some(frames) = sse.next_frames().await? {
                for frame in frames {
                    let event = parse_frame_json(&frame.data)?;
                    let index = optional_token_count(event.get("index"));

                    match str_field(&event, "type").unwrap_or_default() {
                        "message_start" => {
                            let reported =
                                to_llm_usage(event.get("message").and_then(|m| m.get("usage")));
                            if let Some(usage) = reported {
                                prompt_usage = Some(usage);
                                yield LlmStreamChunk::PromptUsage {
                                    prompt_tokens: usage.prompt_tokens,
                                };
                            }
                        }
                        "message_delta" => {
                            if let Some(usage) = usage_object(event.get("usage")) {
                                completion_tokens = Some(token_count(usage.get("output_tokens")));
                            }
                        }
                        "content_block_start" => {
                            let block = event.get("content_block").filter(|b| b.is_object());
                            if let (Some(index), Some(block)) = (index, block) {
                                let started = if str_field(block, "type") == Some("text") {
                                    StreamBlock::Text(String::new())
                                } else {
                                    StreamBlock::ToolUse {
                                        id: str_field(block, "id").unwrap_or_default().to_string(),
                                        name: str_field(block, "name")
                                            .unwrap_or_default()
                                            .to_string(),
                                        json: String::new(),
                                    }
                                };
                                match blocks.iter_mut().find(|(key, _)| *key == index) {
                                    Some(slot) => slot.1 = started,
                                    None => blocks.push((index, started)),
                                }
                            }
                        }
                        "content_block_delta" => {
                            let delta = event.get("delta").filter(|d| d.is_object());
                            let block = index.and_then(|index| {
                                blocks.iter_mut().find(|(key, _)| *key == index)
                            });
                            if let (Some(delta), Some((_, block))) = (delta, block) {
                                match (str_field(delta, "type"), block) {
                                    (Some("text_delta"), StreamBlock::Text(text)) => {
                                        let piece = str_field(delta, "text").unwrap_or_default();
                                        text.push_str(piece);
                                        yield LlmStreamChunk::TextDelta { text: piece.to_string() };
                                    }
                                    (
                                        Some("input_json_delta"),
                                        StreamBlock::ToolUse { json, .. },
                                    ) => {
                                        json.push_str(
                                            str_field(delta, "partial_json").unwrap_or_default(),
                                        );
                                    }
                                    _ => {}
                                }
                            }
                        }
                        "error" => {
                            let message = event
                                .get("error")
                                .and_then(|error| str_field(error, "message"))
                                .unwrap_or("unknown error");
                            Err(DomainError::internal(format!("Anthropic stream error: {message}")))?;
                        }
                        // content_block_stop, message_stop and ping carry
                        // nothing needed here, and event types added later
                        // are to be ignored rather than treated as errors.
                        _ => {}
                    }
                }
            }
            drop(sse);

            let mut text: Option<String> = None;
            let mut tool_calls = Vec::new();
            for (_, block) in blocks {
                match block {
                    StreamBlock::Text(content) => text = Some(content),
                    StreamBlock::ToolUse { id, name, json } => tool_calls.push(LlmToolCall {
                        id,
                        name,
                        arguments: parse_tool_arguments(&json),
                    }),
                }
            }

            let usage = match (prompt_usage, completion_tokens) {
                (Some(usage), Some(completion_tokens)) => {
                    Some(LlmUsage { completion_tokens, ..usage })
                }
                _ => None,
            };
            yield LlmStreamChunk::Done(LlmCompletionResult { content: text, tool_calls, usage });
        })
    }
}
