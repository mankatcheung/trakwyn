use async_graphql::{Context, Object, Result, SimpleObject};

use super::enums::OAuthProviderEnum;
use super::support::{container, iso, require_user};
use crate::domain::oauth_account::OAuthAccount;
use crate::http::errors::GraphQLResultExt;
use crate::use_cases::oauth::UnlinkOAuthAccountInput;

#[derive(SimpleObject)]
#[graphql(name = "LinkedOAuthAccount")]
pub struct LinkedOAuthAccountObject {
    provider: Option<OAuthProviderEnum>,
    email: Option<String>,
    created_at: Option<String>,
}

impl From<OAuthAccount> for LinkedOAuthAccountObject {
    fn from(account: OAuthAccount) -> Self {
        Self {
            provider: Some(account.provider.into()),
            email: account.email,
            created_at: Some(iso(account.created_at)),
        }
    }
}

#[derive(Default)]
pub struct OAuthAccountsQuery;

#[Object]
impl OAuthAccountsQuery {
    #[graphql(name = "linkedOAuthAccounts")]
    async fn linked_oauth_accounts(
        &self,
        ctx: &Context<'_>,
    ) -> Result<Option<Vec<LinkedOAuthAccountObject>>> {
        let user = require_user(ctx)?;
        let links =
            container(ctx).list_linked_oauth_accounts_use_case().execute(&user.sub).await.gql()?;
        Ok(Some(links.into_iter().map(LinkedOAuthAccountObject::from).collect()))
    }
}

#[derive(Default)]
pub struct OAuthAccountsMutation;

#[Object]
impl OAuthAccountsMutation {
    #[graphql(name = "unlinkOAuthAccount")]
    async fn unlink_oauth_account(
        &self,
        ctx: &Context<'_>,
        provider: OAuthProviderEnum,
    ) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        container(ctx)
            .unlink_oauth_account_use_case()
            .execute(UnlinkOAuthAccountInput {
                user_id: user.sub.clone(),
                provider: provider.into(),
            })
            .await
            .gql()?;
        Ok(Some(true))
    }
}
