use async_graphql::{Context, Object, Result, SimpleObject, ID};

use super::enums::ApiTokenScope;
use super::support::{container, iso, require_user};
use crate::domain::api_token::ApiToken;
use crate::http::errors::GraphQLResultExt;
use crate::use_cases::api_tokens::CreateApiTokenInput;

#[derive(SimpleObject)]
#[graphql(name = "ApiToken")]
pub struct ApiTokenObject {
    id: Option<ID>,
    name: Option<String>,
    scope: Option<String>,
    last_used_at: Option<String>,
    created_at: Option<String>,
}

impl From<ApiToken> for ApiTokenObject {
    fn from(token: ApiToken) -> Self {
        Self {
            id: Some(ID(token.id)),
            name: Some(token.name),
            scope: Some(token.scope.as_str().to_string()),
            last_used_at: token.last_used_at.map(iso),
            created_at: Some(iso(token.created_at)),
        }
    }
}

/// The only place the raw token is ever sent.
#[derive(SimpleObject)]
#[graphql(name = "CreateApiTokenPayload")]
pub struct CreateApiTokenPayload {
    id: Option<ID>,
    name: Option<String>,
    token: Option<String>,
    scope: Option<String>,
    created_at: Option<String>,
}

#[derive(Default)]
pub struct ApiTokensQuery;

#[Object]
impl ApiTokensQuery {
    async fn api_tokens(&self, ctx: &Context<'_>) -> Result<Option<Vec<ApiTokenObject>>> {
        let user = require_user(ctx)?;
        let tokens = container(ctx).list_api_tokens_use_case().execute(&user.sub).await.gql()?;
        Ok(Some(tokens.into_iter().map(ApiTokenObject::from).collect()))
    }
}

#[derive(Default)]
pub struct ApiTokensMutation;

#[Object]
impl ApiTokensMutation {
    async fn create_api_token(
        &self,
        ctx: &Context<'_>,
        name: String,
        scope: Option<ApiTokenScope>,
    ) -> Result<Option<CreateApiTokenPayload>> {
        let user = require_user(ctx)?;
        let output = container(ctx)
            .create_api_token_use_case()
            .execute(CreateApiTokenInput {
                user_id: user.sub.clone(),
                name,
                scope: scope.map(Into::into),
            })
            .await
            .gql()?;
        Ok(Some(CreateApiTokenPayload {
            id: Some(ID(output.token.id)),
            name: Some(output.token.name),
            token: Some(output.raw_token),
            scope: Some(output.token.scope.as_str().to_string()),
            created_at: Some(iso(output.token.created_at)),
        }))
    }

    async fn delete_api_token(&self, ctx: &Context<'_>, id: ID) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        container(ctx).delete_api_token_use_case().execute(&id.0, &user.sub).await.gql()?;
        Ok(Some(true))
    }
}
