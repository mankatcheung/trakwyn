//! The one place that decides what an error is allowed to put in the logs.
//!
//! Telemetry is a copy of the data held by a third party on its own retention
//! schedule, outside the erasure path the schema is careful about: deleting
//! the user does not delete the log. A failed lookup must not ship the value
//! it was looking up.
//!
//! So the rule is an allow-list, not a deny-list. A new error type cannot
//! leak a new field by being new, and a field has to be named here to
//! survive. `name`/`type` and `code` keep the expected/unexpected split and
//! any log-based grouping working; `message` and `stack` keep a failure
//! diagnosable. The `cause` chain is given the same treatment rather than
//! being trusted or dropped.

use std::error::Error;
use std::fmt::Write as _;

use crate::use_cases::errors::DomainError;

/// How deep a `cause` chain is followed. A cap rather than a cycle check:
/// cheaper, and no real chain is this long.
const MAX_CAUSE_DEPTH: usize = 5;

/// A database driver can append the bound parameters to the message itself
/// (`Failed query: select … where "User"."email" = $1\nparams:
/// someone@example.com,1`). The line is stripped. The SQL above it stays: it
/// has placeholders, not values, and it is what makes the failure readable.
const SQL_PARAMS_PREFIX: &str = "params:";
const REDACTED_PARAMS_LINE: &str = "params: [redacted]";

/// What an error is called when nothing better is known. A `dyn Error` does
/// not carry its type's name, and its `Debug` form is not safe to read one
/// out of.
const GENERIC_NAME: &str = "Error";
const DOMAIN_ERROR_NAME: &str = "DomainError";

/// What is left of an error after serialization.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SerializedError {
    pub name: String,
    /// Redundant with `name` here, but existing Axiom queries group by `type`.
    pub type_name: String,
    pub message: String,
    /// Always present, and always empty in this implementation: an error
    /// here carries no stack trace. Kept so a line has the same fields
    /// whichever implementation wrote it.
    pub stack: String,
    /// A `DomainError`'s code, e.g. `NOT_FOUND`.
    pub code: Option<String>,
    pub cause: Option<Box<SerializedError>>,
}

/// The characters a JavaScript regular expression's `^` and `$` treat as
/// line breaks in multiline mode.
fn is_line_break(character: char) -> bool {
    matches!(character, '\n' | '\r' | '\u{2028}' | '\u{2029}')
}

fn redact_query_params(text: &str) -> String {
    let mut redacted = String::with_capacity(text.len());
    let mut rest = text;
    loop {
        let end = rest.find(is_line_break).unwrap_or(rest.len());
        let line = &rest[..end];
        redacted.push_str(if line.starts_with(SQL_PARAMS_PREFIX) {
            REDACTED_PARAMS_LINE
        } else {
            line
        });
        match rest[end..].chars().next() {
            Some(line_break) => {
                redacted.push(line_break);
                rest = &rest[end + line_break.len_utf8()..];
            }
            None => return redacted,
        }
    }
}

fn serialize_at_depth(err: &(dyn Error + 'static), depth: usize) -> SerializedError {
    let (name, code) = match err.downcast_ref::<DomainError>() {
        Some(domain) => (DOMAIN_ERROR_NAME, Some(domain.code().as_str().to_string())),
        None => (GENERIC_NAME, None),
    };
    let cause = match err.source() {
        Some(source) if depth < MAX_CAUSE_DEPTH => {
            Some(Box::new(serialize_at_depth(source, depth + 1)))
        }
        _ => None,
    };
    SerializedError {
        name: name.to_string(),
        type_name: name.to_string(),
        message: redact_query_params(&err.to_string()),
        stack: String::new(),
        code,
        cause,
    }
}

/// Reduces an error to the fields a log may carry.
pub fn serialize_logged_error(err: &(dyn Error + 'static)) -> SerializedError {
    serialize_at_depth(err, 0)
}

fn push_json_string(out: &mut String, text: &str) {
    // Serializing a `&str` cannot fail; the fallback keeps the line valid JSON regardless.
    out.push_str(&serde_json::to_string(text).unwrap_or_else(|_| "\"\"".to_string()));
}

impl SerializedError {
    /// Appends this error as a JSON object, fields in the order the original
    /// implementation's lines have them.
    pub fn write_json(&self, out: &mut String) {
        out.push_str("{\"type\":");
        push_json_string(out, &self.type_name);
        out.push_str(",\"message\":");
        push_json_string(out, &self.message);
        out.push_str(",\"stack\":");
        push_json_string(out, &self.stack);
        out.push_str(",\"name\":");
        push_json_string(out, &self.name);
        if let Some(code) = &self.code {
            out.push_str(",\"code\":");
            push_json_string(out, code);
        }
        if let Some(cause) = &self.cause {
            out.push_str(",\"cause\":");
            cause.write_json(out);
        }
        out.push('}');
    }

    pub fn to_json(&self) -> String {
        let mut out = String::new();
        self.write_json(&mut out);
        out
    }

    /// One line for a terminal: `DomainError [NOT_FOUND]: Skill not found`.
    pub fn describe(&self) -> String {
        let mut line = self.name.clone();
        if let Some(code) = &self.code {
            let _ = write!(line, " [{code}]");
        }
        let _ = write!(line, ": {}", self.message);
        line
    }
}

#[cfg(test)]
mod tests {
    use std::fmt;

    use serde_json::{json, Value};

    use super::*;

    const EMAIL: &str = "never-seen-before@example.com";

    /// An error with the shape a query failure has: text that quotes the
    /// bound parameters, extra data on the side, and a cause.
    #[derive(Debug)]
    struct QueryError {
        params: Vec<String>,
        cause: Option<Box<dyn Error + Send + Sync>>,
    }

    impl fmt::Display for QueryError {
        fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
            write!(
                f,
                "Failed query: select \"id\", \"email\" from \"User\" where \"User\".\"email\" = $1 limit $2\nparams: {}",
                self.params.join(",")
            )
        }
    }

    impl Error for QueryError {
        fn source(&self) -> Option<&(dyn Error + 'static)> {
            self.cause.as_deref().map(|cause| cause as &(dyn Error + 'static))
        }
    }

    fn find_user_by_email() -> QueryError {
        QueryError {
            params: vec![EMAIL.to_string(), "1".to_string()],
            cause: Some("Connection terminated unexpectedly".into()),
        }
    }

    /// An error whose only content is its text and, optionally, a cause.
    #[derive(Debug)]
    struct Plain {
        message: String,
        cause: Option<Box<dyn Error + Send + Sync>>,
    }

    impl fmt::Display for Plain {
        fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
            f.write_str(&self.message)
        }
    }

    impl Error for Plain {
        fn source(&self) -> Option<&(dyn Error + 'static)> {
            self.cause.as_deref().map(|cause| cause as &(dyn Error + 'static))
        }
    }

    fn as_value(serialized: &SerializedError) -> Value {
        serde_json::from_str(&serialized.to_json()).unwrap()
    }

    #[test]
    fn keeps_no_bound_parameter_of_a_failed_query_in_any_field() {
        let serialized = serialize_logged_error(&find_user_by_email());

        assert!(!serialized.to_json().contains(EMAIL));
        assert!(!serialized.message.contains(EMAIL));
        assert!(!format!("{serialized:?}").contains(EMAIL));
        let value = as_value(&serialized);
        assert!(value.get("params").is_none());
        assert!(value.get("query").is_none());
    }

    #[test]
    fn keeps_the_sql_and_its_placeholders_which_hold_no_values() {
        let serialized = serialize_logged_error(&find_user_by_email());

        assert!(serialized.message.contains("\"User\".\"email\" = $1"));
        assert!(serialized.message.contains("params: [redacted]"));
    }

    #[test]
    fn redacts_a_params_line_wherever_it_falls_and_only_at_a_line_start() {
        assert_eq!(redact_query_params("params: a,b"), "params: [redacted]");
        assert_eq!(
            redact_query_params("first\r\nparams: a\r\nlast"),
            "first\r\nparams: [redacted]\r\nlast"
        );
        assert_eq!(
            redact_query_params("a\nparams: x\nb\nparams: y"),
            "a\nparams: [redacted]\nb\nparams: [redacted]"
        );
        assert_eq!(redact_query_params("a\u{2028}params: x"), "a\u{2028}params: [redacted]");
        assert_eq!(redact_query_params("query params: kept"), "query params: kept");
        assert_eq!(redact_query_params(""), "");
        assert_eq!(redact_query_params("no trailing break\n"), "no trailing break\n");
    }

    #[test]
    fn keeps_name_type_and_code_which_the_expected_unexpected_split_relies_on() {
        let serialized = serialize_logged_error(&DomainError::conflict("Nope"));

        assert_eq!(
            as_value(&serialized),
            json!({
                "type": "DomainError",
                "message": "Nope",
                "stack": "",
                "name": "DomainError",
                "code": "CONFLICT",
            })
        );
    }

    #[test]
    fn reports_an_internal_error_with_its_code_and_its_cause() {
        let error = DomainError::internal(find_user_by_email());

        let serialized = serialize_logged_error(&error);

        assert_eq!(serialized.code.as_deref(), Some("INTERNAL_ERROR"));
        assert!(serialized.message.starts_with("internal error: Failed query:"));
        assert!(serialized.cause.is_some());
        assert!(!serialized.to_json().contains(EMAIL));
    }

    #[test]
    fn drops_everything_an_error_carries_beside_its_text() {
        let serialized =
            serialize_logged_error(&Plain { message: "Provider refused".to_string(), cause: None });

        assert_eq!(
            as_value(&serialized),
            json!({ "type": "Error", "message": "Provider refused", "stack": "", "name": "Error" })
        );
        assert_eq!(serialized.code, None);
        assert_eq!(serialized.cause, None);
    }

    #[test]
    fn gives_a_cause_the_same_treatment_instead_of_trusting_or_dropping_it() {
        let error = Plain {
            message: "Login failed".to_string(),
            cause: Some(Box::new(find_user_by_email())),
        };

        let serialized = serialize_logged_error(&error);

        let cause = serialized.cause.as_deref().unwrap();
        assert!(cause.message.contains("params: [redacted]"));
        assert_eq!(cause.cause.as_deref().unwrap().message, "Connection terminated unexpectedly");
        assert!(!serialized.to_json().contains(EMAIL));
    }

    #[test]
    fn stops_following_a_cause_chain_at_a_fixed_depth() {
        let mut chain = Plain { message: "deepest".to_string(), cause: None };
        for level in 0..8 {
            chain = Plain { message: format!("level {level}"), cause: Some(Box::new(chain)) };
        }

        let serialized = serialize_logged_error(&chain);
        let mut node = &serialized;
        let mut depth = 0;
        while let Some(cause) = node.cause.as_deref() {
            node = cause;
            depth += 1;
        }

        assert_eq!(depth, 5);
    }

    #[test]
    fn describes_an_error_on_one_line_for_a_terminal() {
        assert_eq!(
            serialize_logged_error(&DomainError::not_found("Skill")).describe(),
            "DomainError [NOT_FOUND]: Skill not found"
        );
        let plain = Plain { message: "boom".to_string(), cause: None };
        assert_eq!(serialize_logged_error(&plain).describe(), "Error: boom");
    }

    #[test]
    fn escapes_text_so_the_output_stays_one_json_value() {
        let plain = Plain { message: "line one\n\"quoted\" \\ end".to_string(), cause: None };

        let value = as_value(&serialize_logged_error(&plain));

        assert_eq!(value["message"], "line one\n\"quoted\" \\ end");
    }
}
