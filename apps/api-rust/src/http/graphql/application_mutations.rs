use async_graphql::{Context, InputObject, MaybeUndefined, Object, Result, SimpleObject, ID};
use chrono::{DateTime, NaiveDate, NaiveDateTime, NaiveTime, Utc};

use super::applications::{application_objects, int, JobApplicationObject};
use super::enums::ApplicationStatusEnum;
use super::support::{container, require_user};
use crate::http::errors::GraphQLResultExt;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::jobs::{
    BulkAddTagToApplicationsInput, BulkDeleteApplicationsInput, BulkRestoreApplicationsInput,
    BulkUpdateApplicationsInput, CreateApplicationInput, DeleteApplicationInput, EmptyTrashInput,
    MoveApplicationOnBoardInput, PermanentlyDeleteApplicationInput, RestoreApplicationInput,
    UpdateApplicationInput,
};

#[derive(InputObject)]
#[graphql(name = "CreateApplicationInput")]
pub struct CreateApplicationInputObject {
    company: String,
    role: String,
    status: Option<ApplicationStatusEnum>,
    job_url: Option<String>,
    location: Option<String>,
    salary_range: Option<String>,
    description: Option<String>,
    starred: Option<bool>,
    source: Option<String>,
    follow_up_at: Option<String>,
    tags: Option<Vec<String>>,
}

// Omitting `company`, `role`, `status`, `starred` or `tags` and sending null
// for them are the same: no change. For the rest, null clears the field.
// (Plain comments here and below: a doc comment would become a description
// the contract does not have.)
#[derive(InputObject)]
#[graphql(name = "UpdateApplicationInput")]
pub struct UpdateApplicationInputObject {
    company: Option<String>,
    role: Option<String>,
    status: Option<ApplicationStatusEnum>,
    job_url: MaybeUndefined<String>,
    location: MaybeUndefined<String>,
    salary_range: MaybeUndefined<String>,
    description: MaybeUndefined<String>,
    starred: Option<bool>,
    source: MaybeUndefined<String>,
    follow_up_at: MaybeUndefined<String>,
    tags: Option<Vec<String>>,
}

#[derive(InputObject)]
#[graphql(name = "MoveApplicationOnBoardInput")]
pub struct MoveApplicationOnBoardInputObject {
    application_id: ID,
    // The column the card ends up in; may be the one it started in.
    to_status: ApplicationStatusEnum,
    // The destination column in full, in its new order, including applicationId.
    ordered_ids: Vec<ID>,
}

// Counts rather than a bare `Boolean`: "false" over a list that is now
// almost empty tells the user nothing they can act on.
#[derive(SimpleObject)]
#[graphql(name = "EmptyTrashResult")]
pub struct EmptyTrashResultObject {
    deleted: Option<i32>,
    failed: Option<i32>,
}

#[derive(SimpleObject)]
#[graphql(name = "BulkRestoreResult")]
pub struct BulkRestoreResultObject {
    restored: Option<i32>,
}

/// A timestamp as a client writes one. `apps/api` hands the string to
/// JavaScript's `Date`; this reads the ISO 8601 forms `Date` accepts: a full
/// timestamp with an offset, one without (read as UTC, the server's zone),
/// and a bare date (midnight UTC).
fn parse_timestamp(text: &str) -> Option<DateTime<Utc>> {
    if let Ok(timestamp) = DateTime::parse_from_rfc3339(text) {
        return Some(timestamp.with_timezone(&Utc));
    }
    for format in ["%Y-%m-%dT%H:%M:%S%.f", "%Y-%m-%dT%H:%M"] {
        if let Ok(timestamp) = NaiveDateTime::parse_from_str(text, format) {
            return Some(timestamp.and_utc());
        }
    }
    NaiveDate::parse_from_str(text, "%Y-%m-%d")
        .ok()
        .map(|date| date.and_time(NaiveTime::MIN).and_utc())
}

/// An unreadable timestamp fails the way it does in `apps/api`, where the
/// invalid `Date` only blows up when the row is written: a 500 with no detail.
fn follow_up_at(text: &str) -> DomainResult<DateTime<Utc>> {
    parse_timestamp(text)
        .ok_or_else(|| DomainError::internal("followUpAt is not a valid timestamp"))
}

fn nullable(value: MaybeUndefined<String>) -> Option<Option<String>> {
    match value {
        MaybeUndefined::Undefined => None,
        MaybeUndefined::Null => Some(None),
        MaybeUndefined::Value(value) => Some(Some(value)),
    }
}

fn id_strings(ids: Vec<ID>) -> Vec<String> {
    ids.into_iter().map(|id| id.0).collect()
}

#[derive(Default)]
pub struct ApplicationsMutation;

#[Object]
impl ApplicationsMutation {
    async fn create_application(
        &self,
        ctx: &Context<'_>,
        input: CreateApplicationInputObject,
    ) -> Result<Option<JobApplicationObject>> {
        let user = require_user(ctx)?;
        // An empty string reads as no date.
        let follow_up_at = match input.follow_up_at.as_deref() {
            None | Some("") => None,
            Some(text) => Some(follow_up_at(text).gql()?),
        };
        let application = container(ctx)
            .create_application_use_case()
            .execute(CreateApplicationInput {
                user_id: user.sub.clone(),
                company: input.company,
                role: input.role,
                status: input.status.map(Into::into),
                job_url: input.job_url,
                location: input.location,
                salary_range: input.salary_range,
                description: input.description,
                starred: input.starred,
                source: input.source,
                follow_up_at,
                tags: input.tags,
            })
            .await
            .gql()?;
        Ok(Some(application.into()))
    }

    async fn update_application(
        &self,
        ctx: &Context<'_>,
        id: ID,
        input: UpdateApplicationInputObject,
    ) -> Result<Option<JobApplicationObject>> {
        let user = require_user(ctx)?;
        // Null and an empty string both clear the date.
        let follow_up_at = match input.follow_up_at {
            MaybeUndefined::Undefined => None,
            MaybeUndefined::Null => Some(None),
            MaybeUndefined::Value(text) if text.is_empty() => Some(None),
            MaybeUndefined::Value(text) => Some(Some(follow_up_at(&text).gql()?)),
        };
        let application = container(ctx)
            .update_application_use_case()
            .execute(UpdateApplicationInput {
                user_id: user.sub.clone(),
                application_id: id.0,
                company: input.company,
                role: input.role,
                status: input.status.map(Into::into),
                job_url: nullable(input.job_url),
                location: nullable(input.location),
                salary_range: nullable(input.salary_range),
                description: nullable(input.description),
                starred: input.starred,
                source: nullable(input.source),
                follow_up_at,
                tags: input.tags,
            })
            .await
            .gql()?;
        Ok(Some(application.into()))
    }

    /// Place a card in a kanban column. Returns the destination column in its new order.
    async fn move_application_on_board(
        &self,
        ctx: &Context<'_>,
        input: MoveApplicationOnBoardInputObject,
    ) -> Result<Option<Vec<JobApplicationObject>>> {
        let user = require_user(ctx)?;
        let column = container(ctx)
            .move_application_on_board_use_case()
            .execute(MoveApplicationOnBoardInput {
                user_id: user.sub.clone(),
                application_id: input.application_id.0,
                to_status: input.to_status.into(),
                ordered_ids: id_strings(input.ordered_ids),
            })
            .await
            .gql()?;
        Ok(Some(application_objects(column)))
    }

    async fn delete_application(&self, ctx: &Context<'_>, id: ID) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        container(ctx)
            .delete_application_use_case()
            .execute(DeleteApplicationInput { user_id: user.sub.clone(), application_id: id.0 })
            .await
            .gql()?;
        Ok(Some(true))
    }

    async fn restore_application(&self, ctx: &Context<'_>, id: ID) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        container(ctx)
            .restore_application_use_case()
            .execute(RestoreApplicationInput { user_id: user.sub.clone(), application_id: id.0 })
            .await
            .gql()?;
        Ok(Some(true))
    }

    async fn permanently_delete_application(
        &self,
        ctx: &Context<'_>,
        id: ID,
    ) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        container(ctx)
            .permanently_delete_application_use_case()
            .execute(PermanentlyDeleteApplicationInput {
                user_id: user.sub.clone(),
                application_id: id.0,
            })
            .await
            .gql()?;
        Ok(Some(true))
    }

    async fn empty_trash(&self, ctx: &Context<'_>) -> Result<Option<EmptyTrashResultObject>> {
        let user = require_user(ctx)?;
        let result = container(ctx)
            .empty_trash_use_case()
            .execute(EmptyTrashInput { user_id: user.sub.clone() })
            .await
            .gql()?;
        Ok(Some(EmptyTrashResultObject {
            deleted: Some(int(result.deleted)),
            failed: Some(int(result.failed)),
        }))
    }

    async fn bulk_restore_applications(
        &self,
        ctx: &Context<'_>,
        ids: Vec<ID>,
    ) -> Result<Option<BulkRestoreResultObject>> {
        let user = require_user(ctx)?;
        let result = container(ctx)
            .bulk_restore_applications_use_case()
            .execute(BulkRestoreApplicationsInput {
                user_id: user.sub.clone(),
                application_ids: id_strings(ids),
            })
            .await
            .gql()?;
        Ok(Some(BulkRestoreResultObject { restored: Some(int(result.restored)) }))
    }

    async fn bulk_update_applications(
        &self,
        ctx: &Context<'_>,
        ids: Vec<ID>,
        status: Option<ApplicationStatusEnum>,
        starred: Option<bool>,
    ) -> Result<Option<Vec<JobApplicationObject>>> {
        let user = require_user(ctx)?;
        let applications = container(ctx)
            .bulk_update_applications_use_case()
            .execute(BulkUpdateApplicationsInput {
                user_id: user.sub.clone(),
                application_ids: id_strings(ids),
                status: status.map(Into::into),
                starred,
            })
            .await
            .gql()?;
        Ok(Some(application_objects(applications)))
    }

    async fn bulk_add_tag_to_applications(
        &self,
        ctx: &Context<'_>,
        ids: Vec<ID>,
        tag: String,
    ) -> Result<Option<Vec<JobApplicationObject>>> {
        let user = require_user(ctx)?;
        let applications = container(ctx)
            .bulk_add_tag_to_applications_use_case()
            .execute(BulkAddTagToApplicationsInput {
                user_id: user.sub.clone(),
                application_ids: id_strings(ids),
                tag,
            })
            .await
            .gql()?;
        Ok(Some(application_objects(applications)))
    }

    async fn bulk_delete_applications(
        &self,
        ctx: &Context<'_>,
        ids: Vec<ID>,
    ) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        container(ctx)
            .bulk_delete_applications_use_case()
            .execute(BulkDeleteApplicationsInput {
                user_id: user.sub.clone(),
                application_ids: id_strings(ids),
            })
            .await
            .gql()?;
        Ok(Some(true))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(text: &str) -> DateTime<Utc> {
        text.parse().unwrap()
    }

    #[test]
    fn reads_the_forms_a_client_sends() {
        let expected = at("2026-09-01T10:30:00Z");
        assert_eq!(parse_timestamp("2026-09-01T10:30:00.000Z"), Some(expected));
        assert_eq!(parse_timestamp("2026-09-01T12:30:00+02:00"), Some(expected));
        assert_eq!(parse_timestamp("2026-09-01T10:30:00"), Some(expected));
        assert_eq!(parse_timestamp("2026-09-01T10:30"), Some(expected));
        assert_eq!(parse_timestamp("2026-09-01"), Some(at("2026-09-01T00:00:00Z")));
    }

    #[test]
    fn refuses_anything_else() {
        for text in ["tomorrow", "2026-13-01", " ", "2026-09-01T25:00:00Z"] {
            assert_eq!(parse_timestamp(text), None, "{text:?}");
        }
    }

    #[test]
    fn an_omitted_field_is_no_change_and_null_clears() {
        assert_eq!(nullable(MaybeUndefined::Undefined), None);
        assert_eq!(nullable(MaybeUndefined::Null), Some(None));
        assert_eq!(nullable(MaybeUndefined::Value("x".to_string())), Some(Some("x".to_string())));
    }
}
