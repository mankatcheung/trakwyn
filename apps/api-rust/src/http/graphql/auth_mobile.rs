//! Mobile counterparts of the mutations in `auth.rs`. React Native has no
//! cookie jar tied to the API's domain, so these return both tokens in the
//! response body instead of setting HttpOnly cookies. Session creation,
//! rotation, revocation and the blocklist are unchanged: this is purely a
//! transport difference, and `logout` is shared as it is (it only needs the
//! `Authorization` header).

use async_graphql::{Context, Object, Result, SimpleObject};

use super::auth_flows::{self, require_session, LoginResult};
use super::support::{container, request};
use crate::http::errors::GraphQLResultExt;
use crate::use_cases::oauth::ExchangeMobileOAuthCodeInput;
use crate::use_cases::ports::TokenPair;

#[derive(SimpleObject)]
#[graphql(name = "MobileAuthPayload")]
pub struct MobileAuthPayloadObject {
    access_token: Option<String>,
    refresh_token: Option<String>,
}

impl From<TokenPair> for MobileAuthPayloadObject {
    fn from(tokens: TokenPair) -> Self {
        Self { access_token: Some(tokens.access_token), refresh_token: Some(tokens.refresh_token) }
    }
}

#[derive(SimpleObject)]
#[graphql(name = "MobileLoginResult")]
pub struct MobileLoginResultObject {
    success: Option<bool>,
    totp_required: Option<bool>,
    access_token: Option<String>,
    refresh_token: Option<String>,
}

impl From<LoginResult> for MobileLoginResultObject {
    fn from(result: LoginResult) -> Self {
        let (access_token, refresh_token) = match result.tokens {
            Some(tokens) => (Some(tokens.access_token), Some(tokens.refresh_token)),
            None => (None, None),
        };
        Self {
            success: Some(!result.totp_required),
            totp_required: Some(result.totp_required),
            access_token,
            refresh_token,
        }
    }
}

#[derive(Default)]
pub struct AuthMobileMutation;

#[Object]
impl AuthMobileMutation {
    async fn register_mobile(
        &self,
        ctx: &Context<'_>,
        email: String,
        password: String,
    ) -> Result<Option<MobileAuthPayloadObject>> {
        let tokens = auth_flows::register(container(ctx), email, password, &request(ctx).device)
            .await
            .gql()?;
        Ok(Some(tokens.into()))
    }

    async fn login_mobile(
        &self,
        ctx: &Context<'_>,
        email: String,
        password: String,
    ) -> Result<Option<MobileLoginResultObject>> {
        let result =
            auth_flows::login(container(ctx), email, password, &request(ctx).device).await.gql()?;
        Ok(Some(result.into()))
    }

    async fn login_with_totp_mobile(
        &self,
        ctx: &Context<'_>,
        email: String,
        password: String,
        code: String,
    ) -> Result<Option<MobileAuthPayloadObject>> {
        let tokens = auth_flows::login_with_totp(
            container(ctx),
            email,
            password,
            code,
            &request(ctx).device,
        )
        .await
        .gql()?;
        Ok(Some(tokens.into()))
    }

    async fn refresh_token_mobile(
        &self,
        ctx: &Context<'_>,
        refresh_token: String,
    ) -> Result<Option<MobileAuthPayloadObject>> {
        let tokens = auth_flows::refresh_token(container(ctx), &refresh_token).await.gql()?;
        Ok(Some(tokens.into()))
    }

    // Redeems the short-lived code the OAuth callback hands back through
    // the custom-scheme redirect (JEF-275). The browser leg of Google or
    // GitHub sign-in is server-mediated as on the web; this is the last
    // hop, getting the resulting tokens into the app's own storage over a
    // normal request instead of a URL. `code_verifier` is the PKCE verifier
    // the app generated before opening the browser, so redeeming the code
    // takes more than having intercepted the redirect.
    #[graphql(name = "exchangeMobileOAuthCode")]
    async fn exchange_mobile_oauth_code(
        &self,
        ctx: &Context<'_>,
        code: String,
        code_verifier: String,
    ) -> Result<Option<MobileAuthPayloadObject>> {
        let tokens = container(ctx)
            .exchange_mobile_oauth_code_use_case()
            .execute(ExchangeMobileOAuthCodeInput { code, code_verifier })
            .await
            .gql()?;
        Ok(Some(MobileAuthPayloadObject {
            access_token: Some(tokens.access_token),
            refresh_token: Some(tokens.refresh_token),
        }))
    }

    // The same session re-signed with a fresh `authTime`: the step-up the
    // cookie `reauthenticate` performs, with the tokens in the body.
    async fn reauthenticate_mobile(
        &self,
        ctx: &Context<'_>,
        password: String,
        code: Option<String>,
    ) -> Result<Option<MobileLoginResultObject>> {
        let (user_id, session_id) = require_session(ctx)?;
        let result =
            auth_flows::reauthenticate(container(ctx), user_id, session_id, password, code)
                .await
                .gql()?;
        Ok(Some(result.into()))
    }
}
