use async_graphql::{Context, Object, Result, SimpleObject, ID};

use super::enums::ApplicationStatus;
use super::support::{container, iso, require_user};
use crate::domain::share_link::ShareLink;
use crate::http::errors::GraphQLResultExt;
use crate::use_cases::share_links::{CreateShareLinkInput, SharedSummary, StatusCount};

#[derive(SimpleObject)]
#[graphql(name = "ShareLink")]
pub struct ShareLinkObject {
    id: Option<ID>,
    name: Option<String>,
    last_used_at: Option<String>,
    created_at: Option<String>,
}

impl From<ShareLink> for ShareLinkObject {
    fn from(link: ShareLink) -> Self {
        Self {
            id: Some(ID(link.id)),
            name: Some(link.name),
            last_used_at: link.last_used_at.map(iso),
            created_at: Some(iso(link.created_at)),
        }
    }
}

/// The only place the raw token is ever sent.
#[derive(SimpleObject)]
#[graphql(name = "CreateShareLinkPayload")]
pub struct CreateShareLinkPayload {
    id: Option<ID>,
    name: Option<String>,
    token: Option<String>,
    created_at: Option<String>,
}

#[derive(SimpleObject)]
#[graphql(name = "StatusCount")]
pub struct StatusCountObject {
    status: Option<ApplicationStatus>,
    count: Option<i32>,
}

#[derive(SimpleObject)]
#[graphql(name = "SharedSummary")]
pub struct SharedSummaryObject {
    status_counts: Option<Vec<StatusCountObject>>,
    total_applications: Option<i32>,
    total_interviews: Option<i32>,
    upcoming_interviews: Option<i32>,
    #[graphql(name = "applicationsUpdatedLast7Days")]
    applications_updated_last_7_days: Option<i32>,
    generated_at: Option<String>,
}

/// A count as a GraphQL `Int`.
fn int(count: usize) -> Option<i32> {
    Some(i32::try_from(count).unwrap_or(i32::MAX))
}

impl From<StatusCount> for StatusCountObject {
    fn from(count: StatusCount) -> Self {
        Self { status: Some(count.status.into()), count: int(count.count) }
    }
}

impl From<SharedSummary> for SharedSummaryObject {
    fn from(summary: SharedSummary) -> Self {
        Self {
            status_counts: Some(summary.status_counts.into_iter().map(Into::into).collect()),
            total_applications: int(summary.total_applications),
            total_interviews: int(summary.total_interviews),
            upcoming_interviews: int(summary.upcoming_interviews),
            applications_updated_last_7_days: int(summary.applications_updated_last_7_days),
            generated_at: Some(iso(summary.generated_at)),
        }
    }
}

#[derive(Default)]
pub struct ShareLinksQuery;

#[Object]
impl ShareLinksQuery {
    async fn share_links(&self, ctx: &Context<'_>) -> Result<Option<Vec<ShareLinkObject>>> {
        let user = require_user(ctx)?;
        let links = container(ctx).list_share_links_use_case().execute(&user.sub).await.gql()?;
        Ok(Some(links.into_iter().map(ShareLinkObject::from).collect()))
    }

    // Deliberately unauthenticated: this is the public, read-only summary a
    // mentor or accountability partner views through the share link. An
    // unknown or revoked token is `null`, not an error. (A `//` comment: a
    // doc comment would become a description the contract does not have.)
    async fn shared_summary(
        &self,
        ctx: &Context<'_>,
        token: String,
    ) -> Result<Option<SharedSummaryObject>> {
        let summary = container(ctx).get_shared_summary_use_case().execute(&token).await.gql()?;
        Ok(summary.map(Into::into))
    }
}

#[derive(Default)]
pub struct ShareLinksMutation;

#[Object]
impl ShareLinksMutation {
    async fn create_share_link(
        &self,
        ctx: &Context<'_>,
        name: String,
    ) -> Result<Option<CreateShareLinkPayload>> {
        let user = require_user(ctx)?;
        let output = container(ctx)
            .create_share_link_use_case()
            .execute(CreateShareLinkInput { user_id: user.sub.clone(), name })
            .await
            .gql()?;
        Ok(Some(CreateShareLinkPayload {
            id: Some(ID(output.share_link.id)),
            name: Some(output.share_link.name),
            token: Some(output.raw_token),
            created_at: Some(iso(output.share_link.created_at)),
        }))
    }

    async fn delete_share_link(&self, ctx: &Context<'_>, id: ID) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        container(ctx).delete_share_link_use_case().execute(&id.0, &user.sub).await.gql()?;
        Ok(Some(true))
    }
}
