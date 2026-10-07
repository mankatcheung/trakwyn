use std::pin::Pin;

use async_trait::async_trait;
use futures::Stream;
use serde_json::Value;

use crate::use_cases::errors::DomainResult;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum LlmRole {
    System,
    User,
    Assistant,
    Tool,
}

impl LlmRole {
    pub const ALL: [Self; 4] = [Self::System, Self::User, Self::Assistant, Self::Tool];

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::System => "system",
            Self::User => "user",
            Self::Assistant => "assistant",
            Self::Tool => "tool",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|role| role.as_str() == value)
    }
}

/// One tool invocation the model asked for. `arguments` is the JSON the
/// model produced, normally an object; a provider adapter substitutes `{}`
/// when the model's arguments do not parse.
#[derive(Debug, Clone, PartialEq)]
pub struct LlmToolCall {
    pub id: String,
    pub name: String,
    pub arguments: Value,
}

#[derive(Debug, Clone, PartialEq)]
pub struct LlmMessage {
    pub role: LlmRole,
    pub content: String,
    /// Present on a `Tool` message: which tool call this is the result for.
    pub tool_call_id: Option<String>,
    /// Non-empty on an `Assistant` message that requested tool calls.
    pub tool_calls: Vec<LlmToolCall>,
    /// Marks this as the end of a cacheable prefix (cache everything up to
    /// and including this block). Providers with explicit cache control
    /// (Anthropic) act on it; providers that cache automatically
    /// (OpenAI-compatible, Google AI) ignore it.
    pub cache_breakpoint: bool,
}

impl LlmMessage {
    pub fn new(role: LlmRole, content: impl Into<String>) -> Self {
        Self {
            role,
            content: content.into(),
            tool_call_id: None,
            tool_calls: Vec::new(),
            cache_breakpoint: false,
        }
    }

    pub fn system(content: impl Into<String>) -> Self {
        Self::new(LlmRole::System, content)
    }

    pub fn user(content: impl Into<String>) -> Self {
        Self::new(LlmRole::User, content)
    }

    pub fn assistant(content: impl Into<String>) -> Self {
        Self::new(LlmRole::Assistant, content)
    }

    /// An assistant turn that requested tool calls.
    pub fn assistant_tool_calls(content: impl Into<String>, tool_calls: Vec<LlmToolCall>) -> Self {
        Self { tool_calls, ..Self::new(LlmRole::Assistant, content) }
    }

    /// The result of the tool call `tool_call_id`.
    pub fn tool(tool_call_id: impl Into<String>, content: impl Into<String>) -> Self {
        Self { tool_call_id: Some(tool_call_id.into()), ..Self::new(LlmRole::Tool, content) }
    }

    pub fn with_cache_breakpoint(mut self) -> Self {
        self.cache_breakpoint = true;
        self
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct LlmToolDefinition {
    pub name: String,
    pub description: String,
    /// JSON Schema object describing the tool's arguments.
    pub parameters: Value,
    /// See [`LlmMessage::cache_breakpoint`]: same semantics, applied to the tools list.
    pub cache_breakpoint: bool,
}

impl LlmToolDefinition {
    pub fn new(name: impl Into<String>, description: impl Into<String>, parameters: Value) -> Self {
        Self {
            name: name.into(),
            description: description.into(),
            parameters,
            cache_breakpoint: false,
        }
    }

    pub fn with_cache_breakpoint(mut self) -> Self {
        self.cache_breakpoint = true;
        self
    }
}

/// Token counts for one completed call, as reported by the provider's own
/// response. A call's usage is `None` when the response does not report it
/// at all (a malformed body, or an OpenAI-compatible backend that ignores
/// `stream_options.include_usage`) rather than a fabricated number.
/// `prompt_tokens` is the total the provider counted as input, cache hits
/// included: Anthropic's cache-creation and cache-read tokens are folded in,
/// so the monthly meter reads slightly high on a cache hit.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LlmUsage {
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    /// Of `prompt_tokens`, the part the provider served from its prompt
    /// cache. `None` when the provider does not report the split.
    pub cache_read_tokens: Option<i64>,
    /// Of `prompt_tokens`, the part the provider wrote to its prompt cache.
    pub cache_write_tokens: Option<i64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct LlmCompleteResult {
    pub content: String,
    pub usage: Option<LlmUsage>,
    /// The provider stopped because the output budget ran out (Anthropic
    /// `stop_reason: max_tokens`, OpenAI `finish_reason: length`, Gemini
    /// `finishReason: MAX_TOKENS`), so `content` is cut off mid-thought.
    /// Callers that parse the reply check this first: a truncated JSON
    /// document fails parsing indistinguishably from a malformed one, and
    /// the remedy is different.
    pub truncated: bool,
}

/// A fully assembled tool-calling completion: what the `Done` chunk of a
/// stream carries.
#[derive(Debug, Clone, PartialEq)]
pub struct LlmCompletionResult {
    pub content: Option<String>,
    pub tool_calls: Vec<LlmToolCall>,
    pub usage: Option<LlmUsage>,
}

/// One item of a [`LLMProvider::complete_with_tools_stream`] stream.
#[derive(Debug, Clone, PartialEq)]
pub enum LlmStreamChunk {
    /// Incremental assistant text as it arrives.
    TextDelta { text: String },
    /// The prompt has been counted, before any output exists (Anthropic
    /// reports it on `message_start`). Emitted so a stream that is dropped
    /// mid-reply can still be charged for the input the provider already
    /// billed; `Done` repeats the figure with the output count. Providers
    /// that only learn usage at the end never emit it. Consumers other than
    /// the usage tracker should ignore it.
    PromptUsage { prompt_tokens: i64 },
    /// The fully assembled result. Exactly one, and always last, on a stream
    /// that does not fail, whether or not any deltas preceded it.
    Done(LlmCompletionResult),
}

/// Per-call switches for [`LLMProvider::complete`]. `json` asks the provider
/// to constrain the reply to a JSON object where it has such a mode (OpenAI's
/// `response_format`, Gemini's `responseMimeType`). Providers without a
/// matching switch ignore it; the prompt still says "return only JSON".
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct LlmCompleteOptions {
    pub json: bool,
}

/// The chunks of one streamed completion. An `Err` item ends the stream.
///
/// Cancellation is by drop: dropping the stream closes the provider
/// connection and stops any retry in progress, so a client that disconnects
/// stops costing provider spend as soon as its response body is dropped.
pub type LlmStream = Pin<Box<dyn Stream<Item = DomainResult<LlmStreamChunk>> + Send>>;

/// A chat-completion model reached with one user's (or the platform's) key.
///
/// `max_tokens` is the output budget; `None` means
/// `constants::llm::DEFAULT_MAX_TOKENS`, and every provider clamps it to
/// `constants::llm::MAX_OUTPUT_TOKENS_CAP`.
///
/// Neither method takes a cancellation signal. Dropping the future returned
/// by `complete`, or the stream returned by `complete_with_tools_stream`,
/// aborts the in-flight provider request.
#[async_trait]
pub trait LLMProvider: Send + Sync {
    async fn complete(
        &self,
        messages: &[LlmMessage],
        max_tokens: Option<u32>,
        options: LlmCompleteOptions,
    ) -> DomainResult<LlmCompleteResult>;

    /// Nothing is sent until the stream is first polled, and every failure,
    /// including one before the first byte, arrives as an `Err` item.
    fn complete_with_tools_stream(
        &self,
        messages: &[LlmMessage],
        tools: &[LlmToolDefinition],
        max_tokens: Option<u32>,
    ) -> LlmStream;
}
