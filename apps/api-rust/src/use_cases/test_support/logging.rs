use std::sync::Mutex;

use crate::use_cases::ports::logger::{LogFields, LogValue, LoggedError, Logger};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogLevel {
    Error,
    Warn,
    Info,
}

/// One line a [`FakeLogger`] was asked to write.
#[derive(Debug, Clone, PartialEq)]
pub struct LoggedLine {
    pub level: LogLevel,
    pub message: String,
    /// The error's `Display` text, kept so a test can tell which error it was.
    pub error: Option<String>,
    pub fields: Vec<(&'static str, LogValue)>,
}

impl LoggedLine {
    pub fn field(&self, name: &str) -> Option<&LogValue> {
        self.fields.iter().find(|(key, _)| *key == name).map(|(_, value)| value)
    }
}

/// Keeps every line in memory for assertions.
#[derive(Default)]
pub struct FakeLogger {
    lines: Mutex<Vec<LoggedLine>>,
}

impl FakeLogger {
    pub fn lines(&self) -> Vec<LoggedLine> {
        self.lines.lock().unwrap().clone()
    }

    fn push(&self, level: LogLevel, message: &str, err: LoggedError<'_>, fields: LogFields<'_>) {
        self.lines.lock().unwrap().push(LoggedLine {
            level,
            message: message.to_string(),
            error: err.map(ToString::to_string),
            fields: fields.to_vec(),
        });
    }
}

impl Logger for FakeLogger {
    fn error(&self, message: &str, err: LoggedError<'_>, fields: LogFields<'_>) {
        self.push(LogLevel::Error, message, err, fields);
    }

    fn warn(&self, message: &str, err: LoggedError<'_>, fields: LogFields<'_>) {
        self.push(LogLevel::Warn, message, err, fields);
    }

    fn info(&self, message: &str, fields: LogFields<'_>) {
        self.push(LogLevel::Info, message, None, fields);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn records_lines_with_their_fields() {
        let logger = FakeLogger::default();

        logger
            .info("job done", &[("event", "job.digest.completed".into()), ("sent", 3usize.into())]);
        logger.warn("cache down", None, &[]);

        let lines = logger.lines();
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].level, LogLevel::Info);
        assert_eq!(lines[0].field("event"), Some(&LogValue::Str("job.digest.completed".into())));
        assert_eq!(lines[0].field("sent"), Some(&LogValue::Int(3)));
        assert_eq!(lines[1].level, LogLevel::Warn);
    }
}
