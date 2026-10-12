use async_graphql::Context;

use super::support::{container, request};
use crate::use_cases::auth::{AuthenticatedUser, SessionAuthTime};

/// What the step-up freshness check should make of this caller.
///
/// API-token auth has no session, so the check does not apply. A JWT session
/// with no `authTime` claim (issued before JEF-44) is `Missing`, which is
/// treated as stale.
pub fn session_auth_time(user: &AuthenticatedUser) -> SessionAuthTime {
    match user.sid.as_deref() {
        None | Some("") => SessionAuthTime::NotApplicable,
        Some(_) => user.auth_time.map_or(SessionAuthTime::Missing, SessionAuthTime::At),
    }
}

/// The caller's IP and user agent, for a security-event record.
pub fn device(ctx: &Context<'_>) -> (Option<String>, Option<String>) {
    let device = &request(ctx).device;
    (device.ip_address.clone(), device.user_agent.clone())
}

/// Ends the browser's session: clears the auth cookies on this response.
pub fn clear_auth_cookies(ctx: &Context<'_>) {
    for value in container(ctx).auth_cookies.sign_out() {
        ctx.append_http_header("set-cookie", value);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn user(sid: Option<&str>, auth_time: Option<i64>) -> AuthenticatedUser {
        AuthenticatedUser {
            sub: "user-1".to_string(),
            email: "a@example.com".to_string(),
            sid: sid.map(str::to_string),
            auth_time,
        }
    }

    #[test]
    fn a_session_carries_its_auth_time() {
        assert_eq!(session_auth_time(&user(Some("sid"), Some(42))), SessionAuthTime::At(42));
    }

    #[test]
    fn a_session_with_no_claim_is_missing() {
        assert_eq!(session_auth_time(&user(Some("sid"), None)), SessionAuthTime::Missing);
    }

    #[test]
    fn a_caller_with_no_session_is_exempt() {
        assert_eq!(session_auth_time(&user(None, None)), SessionAuthTime::NotApplicable);
        assert_eq!(session_auth_time(&user(Some(""), Some(42))), SessionAuthTime::NotApplicable);
    }
}
