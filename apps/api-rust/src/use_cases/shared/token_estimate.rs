use serde_json::{json, Value};

use super::js_string::utf16_len;
use crate::use_cases::ports::{LlmMessage, LlmToolDefinition};

/// A rough prompt-token count for when the provider never told us (F3): a
/// stream aborted before an OpenAI-compatible or Gemini backend reached its
/// final usage chunk. About four characters per token is the usual English
/// average; the tool schemas are counted because they are sent every call.
/// Deliberately simple: it exists so an aborted call is charged roughly
/// rather than not at all, and every event it produces is flagged
/// `estimated`.
pub const CHARS_PER_TOKEN_ESTIMATE: usize = 4;

/// Characters are UTF-16 code units and JSON is measured compact, as
/// `apps/api` serialises it, so both implementations charge the same.
pub fn estimate_prompt_tokens(messages: &[LlmMessage], tools: &[LlmToolDefinition]) -> i64 {
    let message_chars: usize = messages
        .iter()
        .map(|message| {
            let tool_calls = if message.tool_calls.is_empty() {
                0
            } else {
                let calls: Vec<Value> = message
                    .tool_calls
                    .iter()
                    .map(|call| {
                        json!({ "id": call.id, "name": call.name, "arguments": call.arguments })
                    })
                    .collect();
                utf16_len(&Value::Array(calls).to_string())
            };
            utf16_len(&message.content) + tool_calls
        })
        .sum();
    let tool_chars: usize = tools
        .iter()
        .map(|tool| {
            utf16_len(&tool.name)
                + utf16_len(&tool.description)
                + utf16_len(&tool.parameters.to_string())
        })
        .sum();
    let tokens = (message_chars + tool_chars).div_ceil(CHARS_PER_TOKEN_ESTIMATE);
    i64::try_from(tokens).unwrap_or(i64::MAX)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::use_cases::ports::LlmToolCall;

    #[test]
    fn counts_about_four_characters_per_token_across_messages() {
        let messages = [LlmMessage::system("a".repeat(40)), LlmMessage::user("b".repeat(40))];
        assert_eq!(estimate_prompt_tokens(&messages, &[]), 20);
    }

    #[test]
    fn includes_tool_schemas_and_serialized_tool_calls_which_are_sent_every_call() {
        let call =
            LlmToolCall { id: "c1".to_string(), name: "list".to_string(), arguments: json!({}) };
        let messages = [LlmMessage::assistant_tool_calls("", vec![call])];
        let tools = [LlmToolDefinition::new(
            "list_applications",
            "Lists them",
            json!({ "type": "object" }),
        )];

        let with_tools = estimate_prompt_tokens(&messages, &tools);
        let without = estimate_prompt_tokens(&[LlmMessage::assistant("")], &[]);

        assert_eq!(without, 0);
        // `[{"arguments":{},"id":"c1","name":"list"}]` is 42 characters, and
        // the tool adds 17 + 10 + 17. 86 / 4, rounded up.
        assert_eq!(with_tools, 22);
    }

    #[test]
    fn rounds_up_so_a_tiny_prompt_is_never_charged_zero() {
        assert_eq!(estimate_prompt_tokens(&[LlmMessage::user("hi")], &[]), 1);
    }
}
