//! Enrolling, disabling and recovering TOTP two-factor authentication.

use async_graphql::{Context, Object, Result, SimpleObject};

use super::session_auth_time::{device, session_auth_time};
use super::support::{container, require_user};
use crate::http::errors::GraphQLResultExt;
use crate::use_cases::user::{
    ConfirmTotpSetupInput, DisableTotpInput, GenerateTotpSecretInput,
    RegenerateTotpBackupCodesInput, TotpSetup,
};

#[derive(SimpleObject)]
#[graphql(name = "TotpSetup")]
pub struct TotpSetupObject {
    secret: Option<String>,
    otpauth_url: Option<String>,
    qr_code_data_url: Option<String>,
}

impl From<TotpSetup> for TotpSetupObject {
    fn from(setup: TotpSetup) -> Self {
        Self {
            secret: Some(setup.secret),
            otpauth_url: Some(setup.otpauth_url),
            qr_code_data_url: Some(setup.qr_code_data_url),
        }
    }
}

#[derive(SimpleObject)]
#[graphql(name = "ConfirmTotpSetupResult")]
pub struct ConfirmTotpSetupResultObject {
    backup_codes: Option<Vec<String>>,
}

#[derive(Default)]
pub struct TotpQuery;

#[Object]
impl TotpQuery {
    async fn totp_enabled(&self, ctx: &Context<'_>) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        let enabled = container(ctx).get_totp_status_use_case().execute(&user.sub).await.gql()?;
        Ok(Some(enabled))
    }
}

#[derive(Default)]
pub struct TotpMutation;

#[Object]
impl TotpMutation {
    async fn begin_totp_setup(
        &self,
        ctx: &Context<'_>,
        password: String,
    ) -> Result<Option<TotpSetupObject>> {
        let user = require_user(ctx)?;
        let setup = container(ctx)
            .generate_totp_secret_use_case()
            .execute(GenerateTotpSecretInput { user_id: user.sub.clone(), password })
            .await
            .gql()?;
        Ok(Some(setup.into()))
    }

    async fn confirm_totp_setup(
        &self,
        ctx: &Context<'_>,
        code: String,
    ) -> Result<Option<ConfirmTotpSetupResultObject>> {
        let user = require_user(ctx)?;
        let (ip_address, user_agent) = device(ctx);
        let output = container(ctx)
            .confirm_totp_setup_use_case()
            .execute(ConfirmTotpSetupInput {
                user_id: user.sub.clone(),
                code,
                ip_address,
                user_agent,
            })
            .await
            .gql()?;
        Ok(Some(ConfirmTotpSetupResultObject { backup_codes: Some(output.backup_codes) }))
    }

    async fn disable_totp(&self, ctx: &Context<'_>, password: String) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        let (ip_address, user_agent) = device(ctx);
        container(ctx)
            .disable_totp_use_case()
            .execute(DisableTotpInput {
                user_id: user.sub.clone(),
                password,
                ip_address,
                user_agent,
            })
            .await
            .gql()?;
        Ok(Some(true))
    }

    async fn regenerate_totp_backup_codes(
        &self,
        ctx: &Context<'_>,
        current_password: String,
    ) -> Result<Option<ConfirmTotpSetupResultObject>> {
        let user = require_user(ctx)?;
        let (ip_address, user_agent) = device(ctx);
        let output = container(ctx)
            .regenerate_totp_backup_codes_use_case()
            .execute(RegenerateTotpBackupCodesInput {
                user_id: user.sub.clone(),
                current_password,
                auth_time: session_auth_time(user),
                ip_address,
                user_agent,
            })
            .await
            .gql()?;
        Ok(Some(ConfirmTotpSetupResultObject { backup_codes: Some(output.backup_codes) }))
    }
}
