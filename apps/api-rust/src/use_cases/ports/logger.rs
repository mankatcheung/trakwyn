use std::error::Error;

/// One structured value on a log line.
#[derive(Debug, Clone, PartialEq)]
pub enum LogValue {
    Str(String),
    Int(i64),
    Float(f64),
    Bool(bool),
    Null,
}

impl From<&str> for LogValue {
    fn from(value: &str) -> Self {
        Self::Str(value.to_string())
    }
}

impl From<String> for LogValue {
    fn from(value: String) -> Self {
        Self::Str(value)
    }
}

impl From<i64> for LogValue {
    fn from(value: i64) -> Self {
        Self::Int(value)
    }
}

impl From<usize> for LogValue {
    fn from(value: usize) -> Self {
        Self::Int(i64::try_from(value).unwrap_or(i64::MAX))
    }
}

impl From<f64> for LogValue {
    fn from(value: f64) -> Self {
        Self::Float(value)
    }
}

impl From<bool> for LogValue {
    fn from(value: bool) -> Self {
        Self::Bool(value)
    }
}

impl<T: Into<LogValue>> From<Option<T>> for LogValue {
    fn from(value: Option<T>) -> Self {
        value.map_or(Self::Null, Into::into)
    }
}

/// Structured fields attached to one log line, beside the message.
///
/// Primitives only, and facts about what happened: never credentials, tokens
/// or personal data. Logs outlive the records they would be copied from
/// (`SecurityEvent` and `LoginEvent` are deleted with the user; a log line is
/// not).
///
/// A line a dashboard or alert should group on carries a stable dotted name
/// as the `event` field (`job.digest.completed`).
pub type LogFields<'a> = &'a [(&'static str, LogValue)];

/// What an error contributes to a log line. An implementation reduces it to
/// an allow-list of fields before writing: an error's own text can quote
/// query parameters, which is user data.
pub type LoggedError<'a> = Option<&'a (dyn Error + Send + Sync + 'static)>;

pub trait Logger: Send + Sync {
    fn error(&self, message: &str, err: LoggedError<'_>, fields: LogFields<'_>);

    /// Something degraded but the request carried on: a circuit breaker
    /// opening, a fail-open path being taken.
    fn warn(&self, message: &str, err: LoggedError<'_>, fields: LogFields<'_>);

    /// Normal activity worth keeping as a record, such as the summary line
    /// each scheduled job run emits. An implementation must write these even
    /// where the process otherwise logs at `warn`.
    fn info(&self, message: &str, fields: LogFields<'_>);
}
