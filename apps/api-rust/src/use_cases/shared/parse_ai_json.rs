//! Reading a model's JSON reply.
//!
//! `apps/api` validates replies with Zod schemas. Each caller here checks
//! the parsed value by hand with the field readers below, which reproduce
//! the Zod rules those schemas use: an object strips unknown keys, a
//! required field must be present with the right type, an optional field may
//! be absent but not null, and a nullable optional field may be either.

use serde_json::{Map, Value};

use super::js_string::js_trim;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::LlmCompleteResult;

const TRUNCATED_MESSAGE: &str = "The AI ran out of room before finishing its reply — try again with less input, or shorten the text it was given";
const INVALID_MESSAGE: &str = "The AI's response couldn't be understood — please try again";
const FENCE: &str = "```";
const FENCE_LANGUAGE: &str = "json";

/// A reply the provider cut off at the output budget is not "invalid JSON":
/// it is incomplete, and asking again with the same input will be cut off
/// again (F2). Checked before [`parse_ai_json`] so the user hears which it
/// was instead of paying for a retry that cannot succeed.
pub fn assert_not_truncated(result: &LlmCompleteResult) -> DomainResult<()> {
    if result.truncated {
        return Err(DomainError::ai_response_invalid(TRUNCATED_MESSAGE));
    }
    Ok(())
}

/// The error for a reply that is not JSON, or is JSON of the wrong shape.
/// One message for both, and nothing about the schema: a silent default
/// would be indistinguishable from a genuine answer (JEF-108), and the
/// reason is of no use to the person reading it.
pub fn invalid_ai_response() -> DomainError {
    DomainError::ai_response_invalid(INVALID_MESSAGE)
}

/// Strips one leading ```` ``` ```` (with an optional `json` tag, any case)
/// and one trailing ```` ``` ````, then surrounding whitespace.
fn strip_code_fence(raw: &str) -> &str {
    let mut clean = js_trim(raw);
    if let Some(rest) = clean.strip_prefix(FENCE) {
        clean = match rest.get(..FENCE_LANGUAGE.len()) {
            Some(tag) if tag.eq_ignore_ascii_case(FENCE_LANGUAGE) => &rest[FENCE_LANGUAGE.len()..],
            _ => rest,
        };
    }
    js_trim(clean.strip_suffix(FENCE).unwrap_or(clean))
}

/// Parses a model's reply as JSON, tolerating a markdown code fence around
/// it. Fails with `AI_RESPONSE_INVALID` when it is not JSON.
pub fn parse_ai_json(raw: &str) -> DomainResult<Value> {
    serde_json::from_str(strip_code_fence(raw)).map_err(|_| invalid_ai_response())
}

/// The reply as an object, or `AI_RESPONSE_INVALID` for any other JSON value.
pub fn as_object(value: &Value) -> DomainResult<&Map<String, Value>> {
    value.as_object().ok_or_else(invalid_ai_response)
}

/// `z.string()`.
pub fn required_string(object: &Map<String, Value>, key: &str) -> DomainResult<String> {
    match object.get(key) {
        Some(Value::String(text)) => Ok(text.clone()),
        _ => Err(invalid_ai_response()),
    }
}

/// `z.string().optional()`: absent is fine, null is not.
pub fn optional_string(object: &Map<String, Value>, key: &str) -> DomainResult<Option<String>> {
    match object.get(key) {
        None => Ok(None),
        Some(Value::String(text)) => Ok(Some(text.clone())),
        Some(_) => Err(invalid_ai_response()),
    }
}

/// `z.string().nullable().optional()`: absent and null both read as `None`.
pub fn nullable_string(object: &Map<String, Value>, key: &str) -> DomainResult<Option<String>> {
    match object.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(text)) => Ok(Some(text.clone())),
        Some(_) => Err(invalid_ai_response()),
    }
}

/// `z.number().optional()`.
pub fn optional_number(object: &Map<String, Value>, key: &str) -> DomainResult<Option<f64>> {
    match object.get(key) {
        None => Ok(None),
        Some(Value::Number(number)) => number.as_f64().map(Some).ok_or_else(invalid_ai_response),
        Some(_) => Err(invalid_ai_response()),
    }
}

fn strings(value: &Value) -> DomainResult<Vec<String>> {
    value
        .as_array()
        .ok_or_else(invalid_ai_response)?
        .iter()
        .map(|item| item.as_str().map(str::to_string).ok_or_else(invalid_ai_response))
        .collect()
}

/// `z.array(z.string())`.
pub fn required_string_array(object: &Map<String, Value>, key: &str) -> DomainResult<Vec<String>> {
    strings(object.get(key).ok_or_else(invalid_ai_response)?)
}

/// `z.array(z.string()).optional()`.
pub fn optional_string_array(
    object: &Map<String, Value>,
    key: &str,
) -> DomainResult<Option<Vec<String>>> {
    object.get(key).map(strings).transpose()
}

/// `z.array(z.object(…))`: each element read by `read`.
pub fn required_object_array<T>(
    object: &Map<String, Value>,
    key: &str,
    read: impl Fn(&Map<String, Value>) -> DomainResult<T>,
) -> DomainResult<Vec<T>> {
    object
        .get(key)
        .and_then(Value::as_array)
        .ok_or_else(invalid_ai_response)?
        .iter()
        .map(|item| read(as_object(item)?))
        .collect()
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::use_cases::errors::ErrorCode;

    fn reply(truncated: bool) -> LlmCompleteResult {
        LlmCompleteResult { content: "{}".to_string(), usage: None, truncated }
    }

    #[test]
    fn parses_and_returns_the_json() {
        assert_eq!(parse_ai_json(r#"{"score": 5}"#).unwrap(), json!({ "score": 5 }));
    }

    #[test]
    fn strips_markdown_code_fences_before_parsing() {
        assert_eq!(parse_ai_json("```json\n{\"score\": 5}\n```").unwrap(), json!({ "score": 5 }));
        assert_eq!(parse_ai_json("```\n{\"score\": 5}\n```").unwrap(), json!({ "score": 5 }));
        assert_eq!(parse_ai_json("  ```JSON{\"a\":1}```  ").unwrap(), json!({ "a": 1 }));
    }

    #[test]
    fn fails_with_ai_response_invalid_when_the_response_is_not_valid_json() {
        let err = parse_ai_json("not json at all").unwrap_err();

        assert_eq!(err.code(), ErrorCode::AiResponseInvalid);
        assert_eq!(err.to_string(), "The AI's response couldn't be understood — please try again");
    }

    #[test]
    fn a_fence_in_the_middle_of_the_reply_is_left_alone() {
        assert!(parse_ai_json("Here you go: ```json {\"a\":1} ``` enjoy").is_err());
    }

    #[test]
    fn a_reader_rejects_the_wrong_type_with_the_same_message() {
        let value = json!({ "name": 7, "tags": "x", "count": "3" });
        let object = as_object(&value).unwrap();

        for err in [
            required_string(object, "name").unwrap_err(),
            optional_string(object, "name").unwrap_err(),
            nullable_string(object, "name").unwrap_err(),
            optional_string_array(object, "tags").unwrap_err(),
            optional_number(object, "count").unwrap_err(),
        ] {
            assert_eq!(err.code(), ErrorCode::AiResponseInvalid);
            assert_eq!(
                err.to_string(),
                "The AI's response couldn't be understood — please try again"
            );
        }
    }

    #[test]
    fn a_required_field_must_be_present() {
        let value = json!({});
        let object = as_object(&value).unwrap();

        assert!(required_string(object, "name").is_err());
        assert!(required_string_array(object, "tags").is_err());
        assert!(required_object_array(object, "rows", |_| Ok(())).is_err());
    }

    #[test]
    fn an_optional_field_may_be_absent_but_not_null() {
        let value = json!({ "summary": null });
        let object = as_object(&value).unwrap();

        assert_eq!(optional_string(object, "missing").unwrap(), None);
        assert!(optional_string(object, "summary").is_err());
        assert_eq!(nullable_string(object, "summary").unwrap(), None);
        assert_eq!(optional_number(object, "missing").unwrap(), None);
        assert_eq!(optional_string_array(object, "missing").unwrap(), None);
    }

    #[test]
    fn only_an_object_is_an_object() {
        for value in [json!([]), json!("text"), json!(null), json!(3)] {
            assert_eq!(as_object(&value).unwrap_err().code(), ErrorCode::AiResponseInvalid);
        }
    }

    #[test]
    fn reads_arrays_of_strings_and_objects() {
        let value = json!({ "tags": ["a", "b"], "rows": [{ "name": "x" }], "mixed": ["a", 1] });
        let object = as_object(&value).unwrap();

        assert_eq!(required_string_array(object, "tags").unwrap(), vec!["a", "b"]);
        assert_eq!(
            required_object_array(object, "rows", |row| required_string(row, "name")).unwrap(),
            vec!["x"]
        );
        assert!(required_string_array(object, "mixed").is_err());
        assert!(required_object_array(object, "tags", |_| Ok(())).is_err());
    }

    #[test]
    fn passes_a_complete_reply_through() {
        assert!(assert_not_truncated(&reply(false)).is_ok());
    }

    #[test]
    fn a_cut_off_reply_fails_with_a_message_about_the_output_budget() {
        let err = assert_not_truncated(&reply(true)).unwrap_err();

        assert_eq!(err.code(), ErrorCode::AiResponseInvalid);
        assert_eq!(
            err.to_string(),
            "The AI ran out of room before finishing its reply — try again with less input, or shorten the text it was given"
        );
    }
}
