//! Small pieces the three provider adapters share when building requests
//! and reading loosely typed provider JSON.

use futures::Stream;
use serde_json::{Map, Value};

use crate::use_cases::constants::llm;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::llm_provider::{LlmStream, LlmStreamChunk};

pub(super) fn boxed(
    stream: impl Stream<Item = DomainResult<LlmStreamChunk>> + Send + 'static,
) -> LlmStream {
    Box::pin(stream)
}

/// The output budget sent to the provider: the caller's, or the default,
/// never above the hard ceiling.
pub(super) fn clamp_max_tokens(max_tokens: Option<u32>) -> u32 {
    max_tokens.unwrap_or(llm::DEFAULT_MAX_TOKENS).min(llm::MAX_OUTPUT_TOKENS_CAP)
}

/// A token count the provider reported, when it is a number at all.
pub(super) fn optional_token_count(value: Option<&Value>) -> Option<i64> {
    let value = value?;
    value.as_i64().or_else(|| value.as_f64().map(|count| count as i64))
}

/// A token count from a usage object; a field the provider left out is 0.
pub(super) fn token_count(value: Option<&Value>) -> i64 {
    optional_token_count(value).unwrap_or(0)
}

/// A provider's usage object, when it sent one.
pub(super) fn usage_object(value: Option<&Value>) -> Option<&Map<String, Value>> {
    value.and_then(Value::as_object)
}

/// Tool-call arguments arrive as a JSON string, streamed in fragments. What
/// does not parse (including nothing at all) becomes `{}` rather than
/// failing the turn.
pub(super) fn parse_tool_arguments(raw: &str) -> Value {
    serde_json::from_str(raw).unwrap_or_else(|_| Value::Object(Map::new()))
}

/// An SSE frame whose `data` is not JSON.
pub(super) fn parse_frame_json(data: &str) -> DomainResult<Value> {
    serde_json::from_str(data).map_err(DomainError::internal)
}

/// `value[key]` as a string slice, when it is one.
pub(super) fn str_field<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key).and_then(Value::as_str)
}
