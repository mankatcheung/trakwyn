use crate::use_cases::clock::now;
use crate::use_cases::constants::reauth::FRESHNESS_WINDOW_MS;

/// When the caller's session last fully authenticated (login or step-up
/// reauth), as far as the step-up check is concerned.
///
/// `apps/api` passes `number | null | undefined`; the three cases are named
/// here because they mean different things.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionAuthTime {
    /// `null`: the check does not apply. API-token auth has no session and no
    /// freshness concept, so it is always treated as fresh.
    NotApplicable,
    /// `undefined`: a JWT session that predates the `authTime` claim
    /// (JEF-44). Treated as maximally stale, so it self-heals on first use.
    Missing,
    /// Epoch milliseconds of the last full authentication.
    At(i64),
}

pub fn is_session_fresh(auth_time: SessionAuthTime) -> bool {
    match auth_time {
        SessionAuthTime::NotApplicable => true,
        SessionAuthTime::Missing => false,
        SessionAuthTime::At(at) => now().timestamp_millis() - at <= FRESHNESS_WINDOW_MS,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ago(ms: i64) -> SessionAuthTime {
        SessionAuthTime::At(now().timestamp_millis() - ms)
    }

    #[test]
    fn a_session_authenticated_just_now_is_fresh() {
        assert!(is_session_fresh(ago(0)));
    }

    #[test]
    fn a_session_inside_the_window_is_fresh() {
        assert!(is_session_fresh(ago(FRESHNESS_WINDOW_MS - 5_000)));
    }

    #[test]
    fn a_session_past_the_window_is_stale() {
        assert!(!is_session_fresh(ago(FRESHNESS_WINDOW_MS + 1_000)));
    }

    #[test]
    fn api_token_auth_is_always_fresh() {
        assert!(is_session_fresh(SessionAuthTime::NotApplicable));
    }

    #[test]
    fn a_session_with_no_auth_time_claim_is_stale() {
        assert!(!is_session_fresh(SessionAuthTime::Missing));
    }
}
