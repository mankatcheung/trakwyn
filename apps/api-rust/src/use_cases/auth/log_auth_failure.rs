use crate::use_cases::ports::logger::{LogValue, Logger};

/// Why a sign-in was refused, as a category (JEF-354).
///
/// An unknown email and a wrong password are deliberately the same
/// `invalid_credentials`: telling them apart in a log would make the log an
/// account-enumeration oracle if it were ever exposed, and a burst is already
/// visible as rate-limit lines (JEF-350). `no_password` is an OAuth-only
/// account; `invalid_code` is a wrong TOTP or backup code after the password
/// was accepted.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthFailureReason {
    InvalidCredentials,
    NoPassword,
    InvalidCode,
}

impl AuthFailureReason {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::InvalidCredentials => "invalid_credentials",
            Self::NoPassword => "no_password",
            Self::InvalidCode => "invalid_code",
        }
    }
}

/// Logs one refused sign-in at `warn`. The submitted email is never passed
/// in, so it cannot reach the line. `user_id` is only given once the password
/// has been accepted: a user id on a password failure would reveal that the
/// account exists, which `invalid_credentials` is there to hide. Without one
/// the line has no `userId` field at all.
pub fn log_auth_failure(
    logger: &dyn Logger,
    event: &'static str,
    reason: AuthFailureReason,
    user_id: Option<&str>,
) {
    let mut fields: Vec<(&'static str, LogValue)> =
        vec![("event", event.into()), ("reason", reason.as_str().into())];
    if let Some(user_id) = user_id {
        fields.push(("userId", user_id.into()));
    }
    logger.warn("Authentication failed", None, &fields);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::use_cases::constants::auth_failure_events;
    use crate::use_cases::test_support::{FakeLogger, LogLevel};

    #[test]
    fn a_password_failure_carries_no_user_id() {
        let logger = FakeLogger::default();

        log_auth_failure(
            &logger,
            auth_failure_events::LOGIN_FAILED,
            AuthFailureReason::InvalidCredentials,
            None,
        );

        let lines = logger.lines();
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].level, LogLevel::Warn);
        assert_eq!(lines[0].message, "Authentication failed");
        assert_eq!(
            lines[0].fields,
            vec![("event", "auth.login.failed".into()), ("reason", "invalid_credentials".into())]
        );
    }

    #[test]
    fn a_code_failure_names_the_user() {
        let logger = FakeLogger::default();

        log_auth_failure(
            &logger,
            auth_failure_events::TOTP_FAILED,
            AuthFailureReason::InvalidCode,
            Some("user-1"),
        );

        let line = &logger.lines()[0];
        assert_eq!(line.field("event"), Some(&LogValue::from("auth.totp.failed")));
        assert_eq!(line.field("reason"), Some(&LogValue::from("invalid_code")));
        assert_eq!(line.field("userId"), Some(&LogValue::from("user-1")));
    }

    #[test]
    fn reasons_keep_the_spelling_the_monitors_query() {
        assert_eq!(AuthFailureReason::InvalidCredentials.as_str(), "invalid_credentials");
        assert_eq!(AuthFailureReason::NoPassword.as_str(), "no_password");
        assert_eq!(AuthFailureReason::InvalidCode.as_str(), "invalid_code");
    }
}
