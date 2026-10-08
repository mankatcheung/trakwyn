use async_graphql::{Context, InputObject, MaybeUndefined, Object, Result, SimpleObject, ID};

use super::optional_input::{nullable, present};
use super::support::{container, iso, require_user};
use crate::domain::skill::Skill;
use crate::http::errors::GraphQLResultExt;
use crate::use_cases::skills::{CreateSkillInput, DeleteSkillInput, UpdateSkillInput};

#[derive(SimpleObject)]
#[graphql(name = "Skill")]
pub struct SkillObject {
    id: Option<ID>,
    user_id: Option<ID>,
    name: Option<String>,
    category: Option<String>,
    proficiency: Option<String>,
    created_at: Option<String>,
}

impl From<Skill> for SkillObject {
    fn from(skill: Skill) -> Self {
        Self {
            id: Some(ID(skill.id)),
            user_id: Some(ID(skill.user_id)),
            name: Some(skill.name),
            category: skill.category,
            proficiency: skill.proficiency,
            created_at: Some(iso(skill.created_at)),
        }
    }
}

#[derive(InputObject)]
#[graphql(name = "CreateSkillInput")]
pub struct CreateSkillArgs {
    name: String,
    category: Option<String>,
    proficiency: Option<String>,
}

#[derive(InputObject)]
#[graphql(name = "UpdateSkillInput")]
pub struct UpdateSkillArgs {
    name: MaybeUndefined<String>,
    category: MaybeUndefined<String>,
    proficiency: MaybeUndefined<String>,
}

#[derive(Default)]
pub struct SkillsQuery;

#[Object]
impl SkillsQuery {
    async fn skills(&self, ctx: &Context<'_>) -> Result<Option<Vec<SkillObject>>> {
        let user = require_user(ctx)?;
        let skills = container(ctx).skill_repository.find_all_by_user_id(&user.sub).await.gql()?;
        Ok(Some(skills.into_iter().map(SkillObject::from).collect()))
    }
}

#[derive(Default)]
pub struct SkillsMutation;

#[Object]
impl SkillsMutation {
    async fn create_skill(
        &self,
        ctx: &Context<'_>,
        input: CreateSkillArgs,
    ) -> Result<Option<SkillObject>> {
        let user = require_user(ctx)?;
        let skill = container(ctx)
            .create_skill_use_case()
            .execute(CreateSkillInput {
                user_id: user.sub.clone(),
                name: input.name,
                category: input.category,
                proficiency: input.proficiency,
            })
            .await
            .gql()?;
        Ok(Some(skill.into()))
    }

    async fn update_skill(
        &self,
        ctx: &Context<'_>,
        id: ID,
        input: UpdateSkillArgs,
    ) -> Result<Option<SkillObject>> {
        let user = require_user(ctx)?;
        let skill = container(ctx)
            .update_skill_use_case()
            .execute(UpdateSkillInput {
                id: id.0,
                user_id: user.sub.clone(),
                name: present(input.name),
                category: nullable(input.category),
                proficiency: nullable(input.proficiency),
            })
            .await
            .gql()?;
        Ok(Some(skill.into()))
    }

    async fn delete_skill(&self, ctx: &Context<'_>, id: ID) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        container(ctx)
            .delete_skill_use_case()
            .execute(DeleteSkillInput { id: id.0, user_id: user.sub.clone() })
            .await
            .gql()?;
        Ok(Some(true))
    }
}
