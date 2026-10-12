use async_graphql::{Context, Object, Result, SimpleObject, ID};

use super::support::{container, iso, require_user};
use crate::domain::company_briefing::CompanyBriefing;
use crate::http::errors::GraphQLResultExt;
use crate::use_cases::company_briefing::{GenerateCompanyBriefingInput, GetCompanyBriefingInput};

#[derive(SimpleObject)]
#[graphql(name = "CompanyBriefing")]
pub struct CompanyBriefingObject {
    id: Option<ID>,
    application_id: Option<ID>,
    content: Option<String>,
    // Lets the tab say how old the briefing is, so a stale one is visibly
    // stale rather than silently presented as current.
    #[graphql(name = "generatedAt")]
    generated_at: Option<String>,
}

impl From<CompanyBriefing> for CompanyBriefingObject {
    fn from(briefing: CompanyBriefing) -> Self {
        Self {
            id: Some(ID(briefing.id)),
            application_id: Some(ID(briefing.application_id)),
            content: Some(briefing.content),
            generated_at: Some(iso(briefing.generated_at)),
        }
    }
}

#[derive(Default)]
pub struct CompanyBriefingQuery;

#[Object]
impl CompanyBriefingQuery {
    // Null when no briefing has been generated yet: that is the tab's
    // normal opening state, not an error.
    async fn company_briefing(
        &self,
        ctx: &Context<'_>,
        application_id: ID,
    ) -> Result<Option<CompanyBriefingObject>> {
        let user = require_user(ctx)?;
        let briefing = container(ctx)
            .get_company_briefing_use_case()
            .execute(GetCompanyBriefingInput {
                user_id: user.sub.clone(),
                application_id: application_id.0,
            })
            .await
            .gql()?;
        Ok(briefing.map(CompanyBriefingObject::from))
    }
}

#[derive(Default)]
pub struct CompanyBriefingMutation;

#[Object]
impl CompanyBriefingMutation {
    // Returns the stored briefing rather than a bare string: it is
    // persisted (JEF-195), and the client shows `generatedAt` alongside it.
    async fn generate_company_briefing(
        &self,
        ctx: &Context<'_>,
        application_id: ID,
    ) -> Result<Option<CompanyBriefingObject>> {
        let user = require_user(ctx)?;
        let briefing = container(ctx)
            .generate_company_briefing_use_case()
            .execute(GenerateCompanyBriefingInput {
                user_id: user.sub.clone(),
                application_id: application_id.0,
            })
            .await
            .gql()?;
        Ok(Some(briefing.into()))
    }
}
