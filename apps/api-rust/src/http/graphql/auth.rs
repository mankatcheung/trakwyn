//! Sign-in for browser clients: the tokens travel as HttpOnly cookies, set
//! and cleared here. `auth_mobile.rs` holds the counterparts that return
//! them in the response body.

use async_graphql::{Context, Object, Result, SimpleObject};

use super::auth_flows::{
    self, clear_auth_cookies, require_session, set_auth_cookies, unauthorized_error, LoginResult,
};
use super::support::{container, request};
use crate::http::constants::cookies;
use crate::http::errors::GraphQLResultExt;
use crate::use_cases::auth::{
    RequestBackupEmailRecoveryInput, RequestPasswordResetInput, ResetPasswordInput,
    VerifyEmailInput,
};
use crate::use_cases::sessions::RevokeSessionInput;

#[derive(SimpleObject)]
#[graphql(name = "LoginResult")]
pub struct LoginResultObject {
    success: Option<bool>,
    totp_required: Option<bool>,
    access_token: Option<String>,
}

/// Sets the cookies when the sign-in produced tokens, and shapes the answer.
fn login_result(ctx: &Context<'_>, result: LoginResult) -> LoginResultObject {
    if let Some(tokens) = &result.tokens {
        set_auth_cookies(ctx, tokens);
    }
    LoginResultObject {
        success: Some(!result.totp_required),
        totp_required: Some(result.totp_required),
        access_token: result.tokens.map(|tokens| tokens.access_token),
    }
}

#[derive(Default)]
pub struct AuthMutation;

#[Object]
impl AuthMutation {
    async fn register(
        &self,
        ctx: &Context<'_>,
        email: String,
        password: String,
    ) -> Result<Option<String>> {
        let tokens = auth_flows::register(container(ctx), email, password, &request(ctx).device)
            .await
            .gql()?;
        set_auth_cookies(ctx, &tokens);
        Ok(Some(tokens.access_token))
    }

    async fn login(
        &self,
        ctx: &Context<'_>,
        email: String,
        password: String,
    ) -> Result<Option<LoginResultObject>> {
        let result =
            auth_flows::login(container(ctx), email, password, &request(ctx).device).await.gql()?;
        Ok(Some(login_result(ctx, result)))
    }

    async fn login_with_totp(
        &self,
        ctx: &Context<'_>,
        email: String,
        password: String,
        code: String,
    ) -> Result<Option<String>> {
        let tokens = auth_flows::login_with_totp(
            container(ctx),
            email,
            password,
            code,
            &request(ctx).device,
        )
        .await
        .gql()?;
        set_auth_cookies(ctx, &tokens);
        Ok(Some(tokens.access_token))
    }

    async fn reauthenticate(
        &self,
        ctx: &Context<'_>,
        password: String,
        code: Option<String>,
    ) -> Result<Option<LoginResultObject>> {
        let (user_id, session_id) = require_session(ctx)?;
        let result =
            auth_flows::reauthenticate(container(ctx), user_id, session_id, password, code)
                .await
                .gql()?;
        Ok(Some(login_result(ctx, result)))
    }

    async fn refresh_token(&self, ctx: &Context<'_>) -> Result<Option<String>> {
        let cookie = request(ctx).cookies.get(cookies::REFRESH_TOKEN).filter(|v| !v.is_empty());
        let Some(refresh_token) = cookie else {
            // No cookie to act on, but `trakwyn_logged_in` may still be
            // lingering (cleared by hand, or an inconsistent state from
            // before): it is cleared too, so the client's session check
            // converges on "logged out" instead of believing in a session
            // that is not there.
            clear_auth_cookies(ctx);
            return Err(unauthorized_error("No refresh token"));
        };

        match auth_flows::refresh_token(container(ctx), refresh_token).await {
            Ok(tokens) => {
                set_auth_cookies(ctx, &tokens);
                Ok(Some(tokens.access_token))
            }
            Err(err) => {
                // A dead session (expired, revoked or reuse-detected) must
                // not leave the non-HttpOnly `trakwyn_logged_in` hint cookie
                // behind. Otherwise the web app's client-side session check
                // keeps believing it is signed in, redirects from /login back
                // to a protected route whose data fetch fails the same way,
                // and bounces between the two until the cookie's own 7-day
                // lifetime runs out.
                clear_auth_cookies(ctx);
                Err(err).gql()
            }
        }
    }

    async fn logout(&self, ctx: &Context<'_>) -> Result<Option<bool>> {
        if let Ok((user_id, session_id)) = require_session(ctx) {
            // Best-effort: an already-expired or missing session should not
            // block logout.
            let _ = container(ctx)
                .revoke_session_use_case()
                .execute(RevokeSessionInput {
                    session_id: session_id.to_string(),
                    user_id: user_id.to_string(),
                    ip_address: None,
                    user_agent: None,
                })
                .await;
        }
        clear_auth_cookies(ctx);
        Ok(Some(true))
    }

    async fn request_password_reset(
        &self,
        ctx: &Context<'_>,
        email: String,
    ) -> Result<Option<bool>> {
        container(ctx)
            .request_password_reset_use_case()
            .execute(RequestPasswordResetInput {
                email,
                ip_address: request(ctx).device.ip_address.clone(),
            })
            .await
            .gql()?;
        Ok(Some(true))
    }

    async fn reset_password(
        &self,
        ctx: &Context<'_>,
        token: String,
        new_password: String,
    ) -> Result<Option<bool>> {
        container(ctx)
            .reset_password_use_case()
            .execute(ResetPasswordInput { token, new_password })
            .await
            .gql()?;
        Ok(Some(true))
    }

    async fn verify_email(&self, ctx: &Context<'_>, token: String) -> Result<Option<bool>> {
        container(ctx).verify_email_use_case().execute(VerifyEmailInput { token }).await.gql()?;
        Ok(Some(true))
    }

    async fn request_backup_email_recovery(
        &self,
        ctx: &Context<'_>,
        backup_email: String,
    ) -> Result<Option<bool>> {
        container(ctx)
            .request_backup_email_recovery_use_case()
            .execute(RequestBackupEmailRecoveryInput {
                backup_email,
                ip_address: request(ctx).device.ip_address.clone(),
            })
            .await
            .gql()?;
        Ok(Some(true))
    }
}
