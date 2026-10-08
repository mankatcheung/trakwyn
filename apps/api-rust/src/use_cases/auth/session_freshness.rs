use chrono::Utc;

use crate::use_cases::constants::reauth::FRESHNESS_WINDOW_MS;

/// When a caller last fully authenticated (login or step-up reauth), as far
/// as the step-up check is concerned.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionAuthTime {
    /// The check does not apply: API-token auth has no session and no
    /// freshness concept, so it is always treated as fresh.
    NotApplicable,
    /// A JWT session that predates the `authTime` claim (JEF-44): treated as
    /// maximally stale, so it self-heals on first use.
    Missing,
    /// Epoch milliseconds of the last full authentication.
    At(i64),
}

pub fn is_session_fresh(auth_time: SessionAuthTime) -> bool {
    match auth_time {
        SessionAuthTime::NotApplicable => true,
        SessionAuthTime::Missing => false,
        SessionAuthTime::At(at) => Utc::now().timestamp_millis() - at <= FRESHNESS_WINDOW_MS,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ago(ms: i64) -> SessionAuthTime {
        SessionAuthTime::At(Utc::now().timestamp_millis() - ms)
    }

    #[test]
    fn is_fresh_when_the_check_does_not_apply() {
        assert!(is_session_fresh(SessionAuthTime::NotApplicable));
    }

    #[test]
    fn is_stale_when_the_token_carries_no_auth_time() {
        assert!(!is_session_fresh(SessionAuthTime::Missing));
    }

    #[test]
    fn is_fresh_within_the_window() {
        assert!(is_session_fresh(ago(FRESHNESS_WINDOW_MS - 1_000)));
    }

    #[test]
    fn is_stale_once_the_window_has_passed() {
        assert!(!is_session_fresh(ago(FRESHNESS_WINDOW_MS + 1_000)));
    }
}
