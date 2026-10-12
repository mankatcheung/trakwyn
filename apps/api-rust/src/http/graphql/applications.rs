//! The `JobApplication` type and the queries that read applications. The
//! mutations are in `application_mutations`.

use async_graphql::{Context, Object, Result, SimpleObject, ID};
use chrono::TimeDelta;

use super::enums::ApplicationStatusEnum;
use super::support::{container, iso, require_user};
use crate::domain::application::Application;
use crate::http::errors::GraphQLResultExt;
use crate::use_cases::clock::now;
use crate::use_cases::constants::trash;
use crate::use_cases::jobs::application_staleness::is_likely_ghosted;
use crate::use_cases::jobs::{
    ApplicationSectionCounts, GetApplicationInput, GetApplicationSectionCountsInput,
    GetApplicationsInput, GetApplicationsPageInput,
};

/// A count as GraphQL's `Int`.
pub(super) fn int(count: impl TryInto<i32>) -> i32 {
    count.try_into().unwrap_or(i32::MAX)
}

#[derive(SimpleObject)]
#[graphql(name = "ApplicationSectionCounts")]
pub struct ApplicationSectionCountsObject {
    notes: Option<i32>,
    interviews: Option<i32>,
    contacts: Option<i32>,
    documents: Option<i32>,
    document_drafts: Option<i32>,
    offers: Option<i32>,
}

impl From<ApplicationSectionCounts> for ApplicationSectionCountsObject {
    fn from(counts: ApplicationSectionCounts) -> Self {
        Self {
            notes: Some(int(counts.notes)),
            interviews: Some(int(counts.interviews)),
            contacts: Some(int(counts.contacts)),
            documents: Some(int(counts.documents)),
            document_drafts: Some(int(counts.document_drafts)),
            offers: Some(int(counts.offers)),
        }
    }
}

pub struct JobApplicationObject {
    application: Application,
    /// Decided when the application is mapped, as `apps/api`'s mapper does.
    likely_ghosted: bool,
}

impl From<Application> for JobApplicationObject {
    fn from(application: Application) -> Self {
        let likely_ghosted = is_likely_ghosted(&application, now());
        Self { application, likely_ghosted }
    }
}

pub(super) fn application_objects(applications: Vec<Application>) -> Vec<JobApplicationObject> {
    applications.into_iter().map(JobApplicationObject::from).collect()
}

#[Object(name = "JobApplication")]
impl JobApplicationObject {
    async fn id(&self) -> Option<ID> {
        Some(ID(self.application.id.clone()))
    }

    async fn user_id(&self) -> Option<ID> {
        Some(ID(self.application.user_id.clone()))
    }

    async fn company(&self) -> Option<&str> {
        Some(&self.application.company)
    }

    async fn role(&self) -> Option<&str> {
        Some(&self.application.role)
    }

    async fn status(&self) -> Option<ApplicationStatusEnum> {
        Some(self.application.status.into())
    }

    async fn job_url(&self) -> Option<&str> {
        self.application.job_url.as_deref()
    }

    async fn location(&self) -> Option<&str> {
        self.application.location.as_deref()
    }

    async fn salary_range(&self) -> Option<&str> {
        self.application.salary_range.as_deref()
    }

    async fn description(&self) -> Option<&str> {
        self.application.description.as_deref()
    }

    async fn applied_at(&self) -> Option<String> {
        self.application.applied_at.map(iso)
    }

    async fn starred(&self) -> Option<bool> {
        Some(self.application.starred)
    }

    async fn source(&self) -> Option<&str> {
        self.application.source.as_deref()
    }

    async fn follow_up_at(&self) -> Option<String> {
        self.application.follow_up_at.map(iso)
    }

    async fn tags(&self) -> Option<&[String]> {
        Some(&self.application.tags)
    }

    async fn board_position(&self) -> Option<i32> {
        Some(self.application.board_position)
    }

    async fn created_at(&self) -> Option<String> {
        Some(iso(self.application.created_at))
    }

    async fn updated_at(&self) -> Option<String> {
        Some(iso(self.application.updated_at))
    }

    async fn deleted_at(&self) -> Option<String> {
        self.application.deleted_at.map(iso)
    }

    // Derived server-side so the retention window has exactly one definition:
    // the Trash screen counts down to this instant.
    async fn purge_at(&self) -> Option<String> {
        self.application
            .deleted_at
            .map(|deleted_at| iso(deleted_at + TimeDelta::milliseconds(trash::RETENTION_MS)))
    }

    async fn likely_ghosted(&self) -> Option<bool> {
        Some(self.likely_ghosted)
    }

    // Resolved on demand: six COUNT(*)s that only the detail page asks for,
    // so list and board queries never pay for them.
    async fn section_counts(
        &self,
        ctx: &Context<'_>,
    ) -> Result<Option<ApplicationSectionCountsObject>> {
        let user = require_user(ctx)?;
        let counts = container(ctx)
            .get_application_section_counts_use_case()
            .execute(GetApplicationSectionCountsInput {
                user_id: user.sub.clone(),
                application_id: self.application.id.clone(),
            })
            .await
            .gql()?;
        Ok(Some(counts.into()))
    }
}

#[derive(SimpleObject)]
#[graphql(name = "ApplicationConnection")]
pub struct ApplicationConnectionObject {
    items: Option<Vec<JobApplicationObject>>,
    next_cursor: Option<String>,
    has_next_page: Option<bool>,
}

#[derive(Default)]
pub struct ApplicationsQuery;

#[Object]
impl ApplicationsQuery {
    async fn applications(
        &self,
        ctx: &Context<'_>,
        status: Option<ApplicationStatusEnum>,
    ) -> Result<Option<Vec<JobApplicationObject>>> {
        let user = require_user(ctx)?;
        let applications = container(ctx)
            .get_applications_use_case()
            .execute(GetApplicationsInput {
                user_id: user.sub.clone(),
                status: status.map(Into::into),
            })
            .await
            .gql()?;
        Ok(Some(application_objects(applications)))
    }

    #[allow(clippy::too_many_arguments)]
    async fn applications_page(
        &self,
        ctx: &Context<'_>,
        status: Option<ApplicationStatusEnum>,
        starred: Option<bool>,
        search: Option<String>,
        cursor: Option<String>,
        limit: Option<i32>,
        likely_ghosted: Option<bool>,
    ) -> Result<Option<ApplicationConnectionObject>> {
        let user = require_user(ctx)?;
        let page = container(ctx)
            .get_applications_page_use_case()
            .execute(GetApplicationsPageInput {
                user_id: user.sub.clone(),
                status: status.map(Into::into),
                starred,
                search,
                likely_ghosted,
                cursor,
                limit: limit.map(i64::from),
            })
            .await
            .gql()?;
        Ok(Some(ApplicationConnectionObject {
            items: Some(application_objects(page.items)),
            next_cursor: page.next_cursor,
            has_next_page: Some(page.has_next_page),
        }))
    }

    async fn application(&self, ctx: &Context<'_>, id: ID) -> Result<Option<JobApplicationObject>> {
        let user = require_user(ctx)?;
        // include_trashed: the web app renders a trashed application
        // read-only (with restore / delete-permanently) rather than 404ing an
        // old link. `deletedAt` tells the client the two states apart.
        let application = container(ctx)
            .get_application_use_case()
            .execute(GetApplicationInput {
                user_id: user.sub.clone(),
                application_id: id.0,
                include_trashed: true,
            })
            .await
            .gql()?;
        Ok(Some(application.into()))
    }

    async fn trashed_applications(
        &self,
        ctx: &Context<'_>,
    ) -> Result<Option<Vec<JobApplicationObject>>> {
        let user = require_user(ctx)?;
        let applications =
            container(ctx).list_trashed_applications_use_case().execute(&user.sub).await.gql()?;
        Ok(Some(application_objects(applications)))
    }
}
