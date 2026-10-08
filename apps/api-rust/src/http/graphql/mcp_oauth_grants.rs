use async_graphql::{Context, Object, Result, SimpleObject, ID};

use super::support::{container, iso, require_user};
use crate::domain::mcp_oauth::McpOAuthGrant;
use crate::http::errors::GraphQLResultExt;

/// `clientId` is deliberately not exposed: it identifies the OAuth client
/// registration, and the user's question is "which app is this", which the
/// name answers.
#[derive(SimpleObject)]
#[graphql(name = "McpOAuthGrant")]
pub struct McpOAuthGrantObject {
    id: Option<ID>,
    client_name: Option<String>,
    scope: Option<String>,
    authorized_at: Option<String>,
    last_used_at: Option<String>,
}

impl From<McpOAuthGrant> for McpOAuthGrantObject {
    fn from(grant: McpOAuthGrant) -> Self {
        Self {
            id: Some(ID(grant.id)),
            client_name: Some(grant.client_name),
            scope: Some(grant.scope.as_str().to_string()),
            authorized_at: Some(iso(grant.authorized_at)),
            last_used_at: grant.last_used_at.map(iso),
        }
    }
}

#[derive(Default)]
pub struct McpOAuthGrantsQuery;

#[Object]
impl McpOAuthGrantsQuery {
    #[graphql(name = "mcpOAuthGrants")]
    async fn mcp_oauth_grants(
        &self,
        ctx: &Context<'_>,
    ) -> Result<Option<Vec<McpOAuthGrantObject>>> {
        let user = require_user(ctx)?;
        let grants =
            container(ctx).list_mcp_oauth_grants_use_case().execute(&user.sub).await.gql()?;
        Ok(Some(grants.into_iter().map(McpOAuthGrantObject::from).collect()))
    }
}

#[derive(Default)]
pub struct McpOAuthGrantsMutation;

#[Object]
impl McpOAuthGrantsMutation {
    #[graphql(name = "revokeMcpOAuthGrant")]
    async fn revoke_mcp_oauth_grant(&self, ctx: &Context<'_>, id: ID) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        let revoked = container(ctx)
            .revoke_mcp_oauth_grant_for_user_use_case()
            .execute(&user.sub, &id.0)
            .await
            .gql()?;
        Ok(Some(revoked))
    }
}
