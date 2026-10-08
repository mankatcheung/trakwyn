use async_graphql::{Context, InputObject, MaybeUndefined, Object, Result, SimpleObject, ID};

use super::js_date::parse_js_date;
use super::optional_input::{date_if_given, nullable, nullable_date, present};
use super::support::{container, iso, require_user};
use crate::domain::work_experience::WorkExperience;
use crate::http::errors::GraphQLResultExt;
use crate::use_cases::work_experience::{
    CreateWorkExperienceInput, DeleteWorkExperienceInput, UpdateWorkExperienceInput,
};

#[derive(SimpleObject)]
#[graphql(name = "WorkExperience")]
pub struct WorkExperienceObject {
    id: Option<ID>,
    user_id: Option<ID>,
    company: Option<String>,
    title: Option<String>,
    location: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
    description: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
}

impl From<WorkExperience> for WorkExperienceObject {
    fn from(experience: WorkExperience) -> Self {
        Self {
            id: Some(ID(experience.id)),
            user_id: Some(ID(experience.user_id)),
            company: Some(experience.company),
            title: Some(experience.title),
            location: experience.location,
            start_date: Some(iso(experience.start_date)),
            end_date: experience.end_date.map(iso),
            description: experience.description,
            created_at: Some(iso(experience.created_at)),
            updated_at: Some(iso(experience.updated_at)),
        }
    }
}

#[derive(InputObject)]
#[graphql(name = "CreateWorkExperienceInput")]
pub struct CreateWorkExperienceArgs {
    company: String,
    title: String,
    location: Option<String>,
    start_date: String,
    end_date: Option<String>,
    description: Option<String>,
}

#[derive(InputObject)]
#[graphql(name = "UpdateWorkExperienceInput")]
pub struct UpdateWorkExperienceArgs {
    company: MaybeUndefined<String>,
    title: MaybeUndefined<String>,
    location: MaybeUndefined<String>,
    start_date: MaybeUndefined<String>,
    end_date: MaybeUndefined<String>,
    description: MaybeUndefined<String>,
}

#[derive(Default)]
pub struct WorkExperienceQuery;

#[Object]
impl WorkExperienceQuery {
    async fn work_experiences(
        &self,
        ctx: &Context<'_>,
    ) -> Result<Option<Vec<WorkExperienceObject>>> {
        let user = require_user(ctx)?;
        let experiences =
            container(ctx).work_experience_repository.find_all_by_user_id(&user.sub).await.gql()?;
        Ok(Some(experiences.into_iter().map(WorkExperienceObject::from).collect()))
    }
}

#[derive(Default)]
pub struct WorkExperienceMutation;

#[Object]
impl WorkExperienceMutation {
    async fn create_work_experience(
        &self,
        ctx: &Context<'_>,
        input: CreateWorkExperienceArgs,
    ) -> Result<Option<WorkExperienceObject>> {
        let user = require_user(ctx)?;
        let experience = container(ctx)
            .create_work_experience_use_case()
            .execute(CreateWorkExperienceInput {
                user_id: user.sub.clone(),
                company: input.company,
                title: input.title,
                location: input.location,
                start_date: parse_js_date(&input.start_date),
                end_date: date_if_given(input.end_date),
                description: input.description,
            })
            .await
            .gql()?;
        Ok(Some(experience.into()))
    }

    async fn update_work_experience(
        &self,
        ctx: &Context<'_>,
        id: ID,
        input: UpdateWorkExperienceArgs,
    ) -> Result<Option<WorkExperienceObject>> {
        let user = require_user(ctx)?;
        let experience = container(ctx)
            .update_work_experience_use_case()
            .execute(UpdateWorkExperienceInput {
                id: id.0,
                user_id: user.sub.clone(),
                company: present(input.company),
                title: present(input.title),
                location: nullable(input.location),
                start_date: date_if_given(present(input.start_date)),
                end_date: nullable_date(input.end_date),
                description: nullable(input.description),
            })
            .await
            .gql()?;
        Ok(Some(experience.into()))
    }

    async fn delete_work_experience(&self, ctx: &Context<'_>, id: ID) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        container(ctx)
            .delete_work_experience_use_case()
            .execute(DeleteWorkExperienceInput { id: id.0, user_id: user.sub.clone() })
            .await
            .gql()?;
        Ok(Some(true))
    }
}
