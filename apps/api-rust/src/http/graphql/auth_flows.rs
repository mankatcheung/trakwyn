//! The sign-in flows the cookie mutations (`auth.rs`) and the mobile
//! mutations (`auth_mobile.rs`) share: `apps/api`'s `AuthResolver`. The two
//! differ only in how the resulting tokens travel.

use async_graphql::{Context, ErrorExtensions};
use chrono::Utc;

use super::support::{container, request};
use crate::domain::session::Session;
use crate::http::container::Container;
use crate::http::request_context::DeviceInfo;
use crate::use_cases::auth::{
    AuthenticatedUser, LoginInput, LoginWithTotpInput, ReauthenticateInput, RegisterInput,
    SessionAuthTime,
};
use crate::use_cases::clock::now;
use crate::use_cases::errors::{DomainError, DomainResult, ErrorCode};
use crate::use_cases::ports::TokenPair;
use crate::use_cases::sessions::{CreateSessionInput, RotateRefreshTokenInput};

/// A sign-in that may still be waiting for its second factor.
pub struct LoginResult {
    pub totp_required: bool,
    pub tokens: Option<TokenPair>,
}

/// An `UNAUTHORIZED` error raised by a resolver itself rather than a use
/// case: sent with a code and no `statusCode`, as `apps/api` sends it.
pub fn unauthorized_error(message: &str) -> async_graphql::Error {
    async_graphql::Error::new(message).extend_with(|_, extensions| {
        extensions.set("code", ErrorCode::Unauthorized.as_str());
    })
}

/// The caller's user id and session id, or `Unauthorized` when the request
/// is anonymous or carries no session (API-token auth).
pub fn require_session<'a>(ctx: &Context<'a>) -> async_graphql::Result<(&'a str, &'a str)> {
    let unauthorized = || unauthorized_error("Unauthorized");
    let user = request(ctx).user.as_ref().ok_or_else(unauthorized)?;
    let sid = user.sid.as_deref().filter(|sid| !sid.is_empty()).ok_or_else(unauthorized)?;
    Ok((&user.sub, sid))
}

/// What the step-up freshness check should judge a caller by: API-token auth
/// has no session and skips the check, and a JWT session with no `authTime`
/// claim (issued before JEF-44) is stale.
pub fn session_auth_time(user: &AuthenticatedUser) -> SessionAuthTime {
    match (user.sid.as_deref().filter(|sid| !sid.is_empty()), user.auth_time) {
        (None, _) => SessionAuthTime::NotApplicable,
        (Some(_), None) => SessionAuthTime::Missing,
        (Some(_), Some(auth_time)) => SessionAuthTime::At(auth_time),
    }
}

pub fn set_auth_cookies(ctx: &Context<'_>, tokens: &TokenPair) {
    let values = container(ctx).auth_cookies.sign_in(&tokens.access_token, &tokens.refresh_token);
    for value in values {
        ctx.append_http_header("set-cookie", value);
    }
}

pub fn clear_auth_cookies(ctx: &Context<'_>) {
    for value in container(ctx).auth_cookies.sign_out() {
        ctx.append_http_header("set-cookie", value);
    }
}

/// Tokens for a session, authenticated just now.
fn sign_fresh(
    container: &Container,
    user_id: &str,
    email: &str,
    session: &Session,
) -> DomainResult<TokenPair> {
    container.token_service.sign(
        user_id,
        email,
        &session.id,
        // Only a session from before rotation tracking has no current id,
        // and `apps/api` then signs a refresh token with no `jti`. The token
        // port cannot leave the claim out, so it is empty instead: either
        // way the next refresh matches nothing and is adopted as the
        // session's baseline.
        session.current_refresh_token_id.as_deref().unwrap_or_default(),
        Utc::now().timestamp_millis(),
    )
}

async fn create_session(
    container: &Container,
    user_id: &str,
    device: &DeviceInfo,
) -> DomainResult<Session> {
    container
        .create_session_use_case()
        .execute(CreateSessionInput {
            user_id: user_id.to_string(),
            user_agent: device.user_agent.clone(),
            ip_address: device.ip_address.clone(),
        })
        .await
}

pub async fn register(
    container: &Container,
    email: String,
    password: String,
    device: &DeviceInfo,
) -> DomainResult<TokenPair> {
    let registered = container
        .register_use_case()
        .execute(RegisterInput { email: email.clone(), password })
        .await?;
    let session = create_session(container, &registered.user_id, device).await?;
    sign_fresh(container, &registered.user_id, &email, &session)
}

pub async fn login(
    container: &Container,
    email: String,
    password: String,
    device: &DeviceInfo,
) -> DomainResult<LoginResult> {
    let user = container
        .login_use_case()
        .execute(LoginInput {
            email,
            password,
            ip_address: device.ip_address.clone(),
            user_agent: device.user_agent.clone(),
        })
        .await?;
    if user.totp_enabled {
        // Login is not complete until TOTP is verified: no session yet.
        return Ok(LoginResult { totp_required: true, tokens: None });
    }
    let session = create_session(container, &user.id, device).await?;
    let tokens = sign_fresh(container, &user.id, &user.email, &session)?;
    Ok(LoginResult { totp_required: false, tokens: Some(tokens) })
}

pub async fn login_with_totp(
    container: &Container,
    email: String,
    password: String,
    code: String,
    device: &DeviceInfo,
) -> DomainResult<TokenPair> {
    let user = container
        .login_with_totp_use_case()
        .execute(LoginWithTotpInput {
            email,
            password,
            code,
            ip_address: device.ip_address.clone(),
        })
        .await?;
    let session = create_session(container, &user.id, device).await?;
    sign_fresh(container, &user.id, &user.email, &session)
}

pub async fn refresh_token(container: &Container, refresh_token: &str) -> DomainResult<TokenPair> {
    let payload = container.token_service.verify_refresh(refresh_token)?;
    let rotated = container
        .rotate_refresh_token_use_case()
        .execute(RotateRefreshTokenInput {
            session_id: payload.sid.clone(),
            presented_token_id: payload.jti,
        })
        .await?;
    // Refreshing must not reset freshness: the original `authTime` is
    // carried forward, so a stale session (or one from before JEF-44, with
    // no claim at all) stays stale until the user really reauthenticates,
    // through login or `reauthenticate`.
    container.token_service.sign(
        &payload.sub,
        &payload.email,
        &payload.sid,
        &rotated.new_token_id,
        payload.auth_time.unwrap_or(0),
    )
}

pub async fn reauthenticate(
    container: &Container,
    user_id: &str,
    session_id: &str,
    password: String,
    code: Option<String>,
) -> DomainResult<LoginResult> {
    let result = container
        .reauthenticate_use_case()
        .execute(ReauthenticateInput { user_id: user_id.to_string(), password, code })
        .await?;
    if result.totp_required {
        return Ok(LoginResult { totp_required: true, tokens: None });
    }

    let session = container
        .session_repository
        .find_by_id(session_id)
        .await?
        .filter(|session| session.revoked_at.is_none() && session.expires_at >= now())
        .ok_or_else(|| DomainError::unauthorized("Session expired — please log in again"))?;

    let tokens = sign_fresh(container, &result.user.id, &result.user.email, &session)?;
    Ok(LoginResult { totp_required: false, tokens: Some(tokens) })
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
    fn a_session_is_judged_by_its_auth_time() {
        assert_eq!(session_auth_time(&user(Some("sid"), Some(42))), SessionAuthTime::At(42));
    }

    #[test]
    fn a_session_without_the_claim_is_missing_it() {
        assert_eq!(session_auth_time(&user(Some("sid"), None)), SessionAuthTime::Missing);
    }

    #[test]
    fn a_caller_with_no_session_skips_the_check() {
        assert_eq!(session_auth_time(&user(None, Some(42))), SessionAuthTime::NotApplicable);
        assert_eq!(session_auth_time(&user(None, None)), SessionAuthTime::NotApplicable);
    }

    #[test]
    fn a_resolver_raised_unauthorized_carries_a_code_and_no_status() {
        let err = unauthorized_error("No refresh token");
        let extensions = err.extensions.as_ref().unwrap();

        assert_eq!(err.message, "No refresh token");
        assert_eq!(extensions.get("code"), Some(&async_graphql::Value::from("UNAUTHORIZED")));
        assert_eq!(extensions.get("statusCode"), None);
    }
}
