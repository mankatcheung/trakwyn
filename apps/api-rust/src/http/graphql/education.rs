use async_graphql::{Context, InputObject, MaybeUndefined, Object, Result, SimpleObject, ID};

use super::js_date::parse_js_date;
use super::optional_input::{date_if_given, nullable, nullable_date, present};
use super::support::{container, iso, require_user};
use crate::domain::education::Education;
use crate::http::errors::GraphQLResultExt;
use crate::use_cases::education::{
    CreateEducationInput, DeleteEducationInput, UpdateEducationInput,
};

#[derive(SimpleObject)]
#[graphql(name = "Education")]
pub struct EducationObject {
    id: Option<ID>,
    user_id: Option<ID>,
    institution: Option<String>,
    degree: Option<String>,
    field: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
    description: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
}

impl From<Education> for EducationObject {
    fn from(education: Education) -> Self {
        Self {
            id: Some(ID(education.id)),
            user_id: Some(ID(education.user_id)),
            institution: Some(education.institution),
            degree: education.degree,
            field: education.field,
            start_date: Some(iso(education.start_date)),
            end_date: education.end_date.map(iso),
            description: education.description,
            created_at: Some(iso(education.created_at)),
            updated_at: Some(iso(education.updated_at)),
        }
    }
}

#[derive(InputObject)]
#[graphql(name = "CreateEducationInput")]
pub struct CreateEducationArgs {
    institution: String,
    degree: Option<String>,
    field: Option<String>,
    start_date: String,
    end_date: Option<String>,
    description: Option<String>,
}

#[derive(InputObject)]
#[graphql(name = "UpdateEducationInput")]
pub struct UpdateEducationArgs {
    institution: MaybeUndefined<String>,
    degree: MaybeUndefined<String>,
    field: MaybeUndefined<String>,
    start_date: MaybeUndefined<String>,
    end_date: MaybeUndefined<String>,
    description: MaybeUndefined<String>,
}

#[derive(Default)]
pub struct EducationQuery;

#[Object]
impl EducationQuery {
    async fn educations(&self, ctx: &Context<'_>) -> Result<Option<Vec<EducationObject>>> {
        let user = require_user(ctx)?;
        let educations =
            container(ctx).education_repository.find_all_by_user_id(&user.sub).await.gql()?;
        Ok(Some(educations.into_iter().map(EducationObject::from).collect()))
    }
}

#[derive(Default)]
pub struct EducationMutation;

#[Object]
impl EducationMutation {
    async fn create_education(
        &self,
        ctx: &Context<'_>,
        input: CreateEducationArgs,
    ) -> Result<Option<EducationObject>> {
        let user = require_user(ctx)?;
        let education = container(ctx)
            .create_education_use_case()
            .execute(CreateEducationInput {
                user_id: user.sub.clone(),
                institution: input.institution,
                degree: input.degree,
                field: input.field,
                start_date: parse_js_date(&input.start_date),
                end_date: date_if_given(input.end_date),
                description: input.description,
            })
            .await
            .gql()?;
        Ok(Some(education.into()))
    }

    async fn update_education(
        &self,
        ctx: &Context<'_>,
        id: ID,
        input: UpdateEducationArgs,
    ) -> Result<Option<EducationObject>> {
        let user = require_user(ctx)?;
        let education = container(ctx)
            .update_education_use_case()
            .execute(UpdateEducationInput {
                id: id.0,
                user_id: user.sub.clone(),
                institution: present(input.institution),
                degree: nullable(input.degree),
                field: nullable(input.field),
                start_date: date_if_given(present(input.start_date)),
                end_date: nullable_date(input.end_date),
                description: nullable(input.description),
            })
            .await
            .gql()?;
        Ok(Some(education.into()))
    }

    async fn delete_education(&self, ctx: &Context<'_>, id: ID) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        container(ctx)
            .delete_education_use_case()
            .execute(DeleteEducationInput { id: id.0, user_id: user.sub.clone() })
            .await
            .gql()?;
        Ok(Some(true))
    }
}
