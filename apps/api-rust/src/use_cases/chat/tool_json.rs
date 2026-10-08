//! What a tool returns, as the JavaScript value `JSON.stringify` would see.
//!
//! `serde_json::Value` sorts object keys and cannot tell a `Date` from a
//! string. Both matter here: key order is the order the model reads (and the
//! original's), and `compactForModel` shortens a `Date` but only clips a
//! string. So this keeps insertion order and has a `Date` variant.

use chrono::{DateTime, SecondsFormat, Utc};

use crate::use_cases::shared::js_string::utf16_len;

#[derive(Debug, Clone, PartialEq)]
pub enum ToolJson {
    Null,
    Bool(bool),
    Number(f64),
    Str(String),
    Date(DateTime<Utc>),
    Array(Vec<ToolJson>),
    Object(Vec<(String, ToolJson)>),
}

impl ToolJson {
    pub fn str(value: impl Into<String>) -> Self {
        Self::Str(value.into())
    }

    pub fn opt_str(value: &Option<String>) -> Self {
        value.as_ref().map_or(Self::Null, |text| Self::Str(text.clone()))
    }

    pub fn opt_date(value: &Option<DateTime<Utc>>) -> Self {
        value.map_or(Self::Null, Self::Date)
    }

    pub fn int(value: impl Into<i64>) -> Self {
        Self::Number(value.into() as f64)
    }

    pub fn opt_number(value: Option<f64>) -> Self {
        value.map_or(Self::Null, Self::Number)
    }

    pub fn object(fields: Vec<(&str, ToolJson)>) -> Self {
        Self::Object(fields.into_iter().map(|(key, value)| (key.to_string(), value)).collect())
    }

    pub fn array(items: impl IntoIterator<Item = ToolJson>) -> Self {
        Self::Array(items.into_iter().collect())
    }

    /// The value of `key` when this is an object that has it.
    pub fn get(&self, key: &str) -> Option<&ToolJson> {
        match self {
            Self::Object(fields) => fields.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            Self::Str(text) => Some(text),
            _ => None,
        }
    }

    /// `JSON.stringify(value)`.
    pub fn stringify(&self) -> String {
        let mut out = String::new();
        self.write(&mut out);
        out
    }

    fn write(&self, out: &mut String) {
        match self {
            Self::Null => out.push_str("null"),
            Self::Bool(value) => out.push_str(if *value { "true" } else { "false" }),
            Self::Number(value) => out.push_str(&js_number(*value)),
            Self::Str(text) => write_string(text, out),
            Self::Date(date) => write_string(&iso(*date), out),
            Self::Array(items) => {
                out.push('[');
                for (index, item) in items.iter().enumerate() {
                    if index > 0 {
                        out.push(',');
                    }
                    item.write(out);
                }
                out.push(']');
            }
            Self::Object(fields) => {
                out.push('{');
                for (index, (key, value)) in fields.iter().enumerate() {
                    if index > 0 {
                        out.push(',');
                    }
                    write_string(key, out);
                    out.push(':');
                    value.write(out);
                }
                out.push('}');
            }
        }
    }
}

/// `Date.prototype.toISOString`.
pub fn iso(date: DateTime<Utc>) -> String {
    date.to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn write_string(text: &str, out: &mut String) {
    // serde_json escapes exactly as `JSON.stringify` does for valid UTF-8.
    out.push_str(&serde_json::to_string(text).unwrap_or_else(|_| "\"\"".to_string()));
}

/// A JavaScript number as `JSON.stringify` prints it: no `.0` on integers,
/// `null` for NaN and infinity.
fn js_number(value: f64) -> String {
    if !value.is_finite() {
        return "null".to_string();
    }
    if value.fract() == 0.0 && value.abs() < 1e15 {
        // `-0` prints as `0`.
        return format!("{}", value as i64);
    }
    format!("{value}")
}

/// `text.length` in UTF-16 code units, for callers that clip.
pub fn js_length(text: &str) -> usize {
    utf16_len(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prints_like_json_stringify() {
        let date = DateTime::<Utc>::from_timestamp(0, 0).unwrap();
        let value = ToolJson::object(vec![
            ("b", ToolJson::int(3)),
            ("a", ToolJson::Number(2.5)),
            ("d", ToolJson::Date(date)),
            ("n", ToolJson::Null),
            ("s", ToolJson::str("q\"\n")),
            ("l", ToolJson::array([ToolJson::Bool(true)])),
        ]);
        assert_eq!(
            value.stringify(),
            r#"{"b":3,"a":2.5,"d":"1970-01-01T00:00:00.000Z","n":null,"s":"q\"\n","l":[true]}"#
        );
    }

    #[test]
    fn non_finite_numbers_are_null() {
        assert_eq!(ToolJson::Number(f64::NAN).stringify(), "null");
        assert_eq!(ToolJson::Number(-0.0).stringify(), "0");
    }
}
