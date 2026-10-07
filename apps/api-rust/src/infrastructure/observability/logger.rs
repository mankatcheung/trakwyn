use std::fmt::Write as _;
use std::io::{self, Write};
use std::sync::Mutex;

use chrono::Utc;

use super::serialize_logged_error::{serialize_logged_error, SerializedError};
use crate::use_cases::ports::logger::{LogFields, LogValue, LoggedError, Logger};

/// The key the reduced error is written under.
const ERROR_KEY: &str = "err";

/// How a line is laid out.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogFormat {
    /// One JSON object per line, in the shape `apps/api`'s production logger
    /// writes: `level` (30/40/50), `time` (epoch milliseconds), `pid`, the
    /// structured fields as top-level keys, `err`, then `msg`.
    Json,
    /// Readable lines for a dev terminal. Only the layout differs; nothing
    /// about what gets logged changes.
    Pretty,
}

/// A line's severity, and the threshold below which `warn` and `error` lines
/// are dropped.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum LogLevel {
    Info,
    Warn,
    Error,
}

impl LogLevel {
    /// The numeric level the JSON lines carry.
    const fn number(self) -> u8 {
        match self {
            Self::Info => 30,
            Self::Warn => 40,
            Self::Error => 50,
        }
    }

    const fn label(self) -> &'static str {
        match self {
            Self::Info => "INFO",
            Self::Warn => "WARN",
            Self::Error => "ERROR",
        }
    }
}

/// The `Logger` the application logs through: one line per call, written to
/// the sink it was given.
///
/// An attached error is reduced by `serialize_logged_error` before it is
/// written, so only the allow-listed fields of an error ever reach a log.
pub struct StructuredLogger {
    sink: Mutex<Box<dyn Write + Send>>,
    format: LogFormat,
    level: LogLevel,
}

impl StructuredLogger {
    /// `level` is the least severe `warn`/`error` line that is written.
    /// `info` lines are written whatever it is.
    pub fn new(sink: Box<dyn Write + Send>, format: LogFormat, level: LogLevel) -> Self {
        Self { sink: Mutex::new(sink), format, level }
    }

    /// Standard output, as `apps/api` configures it: NDJSON at `warn` in
    /// production, readable lines at `info` otherwise.
    pub fn stdout(production: bool) -> Self {
        let (format, level) = if production {
            (LogFormat::Json, LogLevel::Warn)
        } else {
            (LogFormat::Pretty, LogLevel::Info)
        };
        Self::new(Box::new(io::stdout()), format, level)
    }

    fn write(&self, level: LogLevel, message: &str, err: LoggedError<'_>, fields: LogFields<'_>) {
        let error = err.map(|err| serialize_logged_error(err));
        let line = match self.format {
            LogFormat::Json => json_line(level, message, error.as_ref(), fields),
            LogFormat::Pretty => pretty_line(level, message, error.as_ref(), fields),
        };
        // A poisoned lock leaves a sink that can still be written to, and a
        // log line that cannot be written has nowhere to be reported.
        let mut sink = self.sink.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let _ = sink.write_all(line.as_bytes());
        let _ = sink.flush();
    }
}

impl Logger for StructuredLogger {
    fn error(&self, message: &str, err: LoggedError<'_>, fields: LogFields<'_>) {
        if LogLevel::Error >= self.level {
            self.write(LogLevel::Error, message, err, fields);
        }
    }

    fn warn(&self, message: &str, err: LoggedError<'_>, fields: LogFields<'_>) {
        if LogLevel::Warn >= self.level {
            self.write(LogLevel::Warn, message, err, fields);
        }
    }

    /// Not subject to the threshold: production runs at `warn`, which would
    /// drop the one summary line each scheduled job run emits, in the only
    /// environment where its absence means anything.
    fn info(&self, message: &str, fields: LogFields<'_>) {
        self.write(LogLevel::Info, message, None, fields);
    }
}

fn json_string(text: &str) -> String {
    // Serializing a `&str` cannot fail; the fallback keeps the line valid JSON regardless.
    serde_json::to_string(text).unwrap_or_else(|_| "\"\"".to_string())
}

fn json_value(value: &LogValue) -> String {
    match value {
        LogValue::Str(text) => json_string(text),
        LogValue::Int(number) => number.to_string(),
        // JSON has no NaN or infinity; they are written as null, as
        // `JSON.stringify` writes them.
        LogValue::Float(number) if number.is_finite() => {
            serde_json::to_string(number).unwrap_or_else(|_| "null".to_string())
        }
        LogValue::Float(_) | LogValue::Null => "null".to_string(),
        LogValue::Bool(flag) => flag.to_string(),
    }
}

/// The fields to write: each key once (the last value given wins), and
/// without a field named `err` when there is an error to put there.
fn fields_to_write<'a>(
    fields: LogFields<'a>,
    has_error: bool,
) -> impl Iterator<Item = &'a (&'static str, LogValue)> {
    fields.iter().enumerate().filter_map(move |(index, field)| {
        let overridden = fields[index + 1..].iter().any(|(key, _)| *key == field.0);
        let shadowed = has_error && field.0 == ERROR_KEY;
        (!overridden && !shadowed).then_some(field)
    })
}

fn json_line(
    level: LogLevel,
    message: &str,
    error: Option<&SerializedError>,
    fields: LogFields<'_>,
) -> String {
    let mut line = String::new();
    let _ = write!(
        line,
        "{{\"level\":{},\"time\":{},\"pid\":{}",
        level.number(),
        Utc::now().timestamp_millis(),
        std::process::id()
    );
    for (key, value) in fields_to_write(fields, error.is_some()) {
        let _ = write!(line, ",{}:{}", json_string(key), json_value(value));
    }
    if let Some(error) = error {
        let _ = write!(line, ",{}:", json_string(ERROR_KEY));
        error.write_json(&mut line);
    }
    let _ = writeln!(line, ",\"msg\":{}}}", json_string(message));
    line
}

fn pretty_line(
    level: LogLevel,
    message: &str,
    error: Option<&SerializedError>,
    fields: LogFields<'_>,
) -> String {
    let mut line = String::new();
    let _ = writeln!(line, "[{}] {}: {message}", Utc::now().format("%H:%M:%S"), level.label());
    for (key, value) in fields_to_write(fields, error.is_some()) {
        let _ = writeln!(line, "    {key}: {}", json_value(value));
    }
    let mut cause = error;
    let mut label = ERROR_KEY;
    while let Some(error) = cause {
        let _ = writeln!(line, "    {label}: {}", error.describe());
        cause = error.cause.as_deref();
        label = "caused by";
    }
    line
}

#[cfg(test)]
mod tests {
    use std::fmt;
    use std::sync::Arc;

    use serde_json::{json, Value};

    use super::*;
    use crate::use_cases::errors::DomainError;

    /// A sink a test can read back.
    #[derive(Clone, Default)]
    struct Captured(Arc<Mutex<Vec<u8>>>);

    impl Write for Captured {
        fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
            self.0.lock().unwrap().extend_from_slice(buffer);
            Ok(buffer.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    impl Captured {
        fn text(&self) -> String {
            String::from_utf8(self.0.lock().unwrap().clone()).unwrap()
        }

        fn json_lines(&self) -> Vec<Value> {
            self.text().lines().map(|line| serde_json::from_str(line).unwrap()).collect()
        }
    }

    fn logger(format: LogFormat, level: LogLevel) -> (StructuredLogger, Captured) {
        let captured = Captured::default();
        (StructuredLogger::new(Box::new(captured.clone()), format, level), captured)
    }

    fn production() -> (StructuredLogger, Captured) {
        logger(LogFormat::Json, LogLevel::Warn)
    }

    /// An error whose text quotes the parameters of the query that failed.
    #[derive(Debug)]
    struct QueryError;

    impl fmt::Display for QueryError {
        fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
            f.write_str("Failed query: select 1 where email = $1\nparams: someone@example.com")
        }
    }

    impl std::error::Error for QueryError {}

    #[test]
    fn writes_one_json_object_per_line_in_the_production_shape() {
        let (logger, captured) = production();

        logger.warn("Circuit breaker opened", None, &[]);
        logger.error("Something failed", None, &[]);

        let text = captured.text();
        assert_eq!(text.lines().count(), 2);
        assert!(text.ends_with('\n'));
        let lines = captured.json_lines();
        assert_eq!(lines[0]["level"], 40);
        assert_eq!(lines[0]["msg"], "Circuit breaker opened");
        assert_eq!(lines[0]["pid"], std::process::id());
        assert!(lines[0]["time"].as_i64().unwrap() > 1_700_000_000_000);
        assert!(lines[0].get("err").is_none());
        assert_eq!(lines[1]["level"], 50);
        assert_eq!(lines[1]["msg"], "Something failed");
    }

    #[test]
    fn puts_structured_fields_at_the_top_level_where_monitors_group_on_them() {
        let (logger, captured) = production();

        logger.warn(
            "job.digest.misconfigured",
            None,
            &[
                ("event", "job.digest.misconfigured".into()),
                ("job", "digest".into()),
                ("durationMs", 12i64.into()),
                ("ratio", 0.5.into()),
                ("dryRun", false.into()),
                ("cursor", None::<String>.into()),
            ],
        );

        let line = &captured.json_lines()[0];
        assert_eq!(line["event"], "job.digest.misconfigured");
        assert_eq!(line["job"], "digest");
        assert_eq!(line["durationMs"], 12);
        assert_eq!(line["ratio"], 0.5);
        assert_eq!(line["dryRun"], false);
        assert_eq!(line["cursor"], Value::Null);
        assert_eq!(line["msg"], "job.digest.misconfigured");
    }

    #[test]
    fn writes_info_lines_even_where_the_process_logs_at_warn() {
        let (logger, captured) = production();

        logger.info(
            "job.digest.completed",
            &[("event", "job.digest.completed".into()), ("processed", 3usize.into())],
        );

        let line = &captured.json_lines()[0];
        assert_eq!(line["level"], 30);
        assert_eq!(line["event"], "job.digest.completed");
        assert_eq!(line["processed"], 3);
        assert_eq!(line["msg"], "job.digest.completed");
    }

    #[test]
    fn drops_warn_lines_below_the_threshold_but_never_info_or_error() {
        let (logger, captured) = logger(LogFormat::Json, LogLevel::Error);

        logger.warn("dropped", None, &[]);
        logger.error("kept", None, &[]);
        logger.info("also kept", &[]);

        let messages: Vec<_> =
            captured.json_lines().iter().map(|line| line["msg"].clone()).collect();
        assert_eq!(messages, vec![json!("kept"), json!("also kept")]);
    }

    #[test]
    fn reduces_an_attached_error_to_the_allow_listed_fields() {
        let (logger, captured) = production();

        logger.error("Something failed", Some(&QueryError), &[]);

        assert!(!captured.text().contains("someone@example.com"));
        let line = &captured.json_lines()[0];
        assert_eq!(
            line["err"],
            json!({
                "type": "Error",
                "message": "Failed query: select 1 where email = $1\nparams: [redacted]",
                "stack": "",
                "name": "Error",
            })
        );
    }

    #[test]
    fn serializes_the_error_on_warn_too_with_its_code_and_cause() {
        let (logger, captured) = production();
        let err = DomainError::internal(QueryError);

        logger.warn("Cache fail-open", Some(&err), &[]);

        assert!(!captured.text().contains("someone@example.com"));
        let line = &captured.json_lines()[0];
        assert_eq!(line["level"], 40);
        assert_eq!(line["err"]["name"], "DomainError");
        assert_eq!(line["err"]["code"], "INTERNAL_ERROR");
        assert_eq!(line["err"]["cause"]["type"], "Error");
    }

    #[test]
    fn keeps_structured_fields_alongside_the_serialized_error() {
        let (logger, captured) = production();

        logger.error(
            "Scheduled job digest failed",
            Some(&DomainError::conflict("boom")),
            &[("event", "job.digest.failed".into()), ("job", "digest".into())],
        );

        let line = &captured.json_lines()[0];
        assert_eq!(line["event"], "job.digest.failed");
        assert_eq!(line["job"], "digest");
        assert_eq!(line["err"]["message"], "boom");
        assert_eq!(line["err"]["code"], "CONFLICT");
    }

    #[test]
    fn writes_each_key_once_and_lets_the_error_take_the_err_key() {
        let (logger, captured) = production();

        logger.error(
            "failed",
            Some(&DomainError::conflict("boom")),
            &[
                ("err", "a caller's own text".into()),
                ("job", "first".into()),
                ("job", "last".into()),
            ],
        );
        logger.warn("no error", None, &[("err", "kept".into())]);

        let text = captured.text();
        let first = text.lines().next().unwrap();
        assert_eq!(first.matches("\"err\":").count(), 1);
        assert_eq!(first.matches("\"job\":").count(), 1);
        let lines = captured.json_lines();
        assert_eq!(lines[0]["err"]["message"], "boom");
        assert_eq!(lines[0]["job"], "last");
        assert_eq!(lines[1]["err"], "kept");
    }

    #[test]
    fn escapes_a_message_so_a_line_break_in_it_cannot_split_the_line() {
        let (logger, captured) = production();

        logger.error("first\nsecond \"quoted\"", None, &[("note", "a\tb".into())]);

        assert_eq!(captured.text().lines().count(), 1);
        let line = &captured.json_lines()[0];
        assert_eq!(line["msg"], "first\nsecond \"quoted\"");
        assert_eq!(line["note"], "a\tb");
    }

    #[test]
    fn writes_a_number_json_cannot_hold_as_null() {
        let (logger, captured) = production();

        logger.info("ratio", &[("ratio", f64::NAN.into())]);

        assert_eq!(captured.json_lines()[0]["ratio"], Value::Null);
    }

    #[test]
    fn writes_readable_lines_in_dev() {
        let (logger, captured) = logger(LogFormat::Pretty, LogLevel::Info);

        logger.info("job.digest.completed", &[("event", "job.digest.completed".into())]);
        logger.error(
            "Something failed",
            Some(&DomainError::internal(QueryError)),
            &[("attempt", 2i64.into())],
        );

        let text = captured.text();
        let lines: Vec<&str> = text.lines().collect();
        assert!(lines[0].starts_with('['));
        assert!(lines[0].ends_with("] INFO: job.digest.completed"));
        assert_eq!(lines[1], "    event: \"job.digest.completed\"");
        assert!(lines[2].ends_with("] ERROR: Something failed"));
        assert_eq!(lines[3], "    attempt: 2");
        assert!(lines[4].starts_with("    err: DomainError [INTERNAL_ERROR]: internal error:"));
        assert!(text.contains("    caused by: Error: Failed query"));
        assert!(text.contains("params: [redacted]"));
        assert!(!text.contains("someone@example.com"));
    }

    #[test]
    fn logs_at_warn_as_json_in_production_and_at_info_readably_otherwise() {
        let production = StructuredLogger::stdout(true);
        assert_eq!((production.format, production.level), (LogFormat::Json, LogLevel::Warn));

        let dev = StructuredLogger::stdout(false);
        assert_eq!((dev.format, dev.level), (LogFormat::Pretty, LogLevel::Info));
    }
}
