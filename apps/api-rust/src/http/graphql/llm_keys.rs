use async_graphql::{Context, Object, Result, SimpleObject};

use super::support::{container, iso, require_user};
use crate::domain::llm_api_key::LlmApiKey;
use crate::domain::llm_usage_event::LlmUsageSummaryWithLimit;
use crate::http::errors::GraphQLResultExt;
use crate::use_cases::llm_keys::{
    DeleteLlmApiKeyInput, SaveLlmApiKeyInput, SetDefaultLlmProviderInput,
    SetLlmApiKeyMonthlyLimitInput, TestLlmApiKeyInput, TestLlmApiKeyResult,
};

// A value for a GraphQL `Int` field. graphql-js refuses to serialise a
// number outside the 32-bit range and fails the field instead, which is
// what `apps/api` does for a count this large.
fn int32(value: i64) -> Result<i32> {
    i32::try_from(value).map_err(|_| {
        async_graphql::Error::new(format!(
            "Int cannot represent non 32-bit signed integer value: {value}"
        ))
    })
}

// One of the user's saved provider keys. The key itself, encrypted or not,
// is deliberately not part of this type: nothing sends it back out.
#[derive(SimpleObject)]
#[graphql(name = "LlmApiKey")]
pub struct LlmApiKeyObject {
    provider: Option<String>,
    model: Option<String>,
    base_url: Option<String>,
    monthly_token_limit: Option<i32>,
}

impl LlmApiKeyObject {
    fn from_key(key: LlmApiKey) -> Result<Self> {
        Ok(Self {
            provider: Some(key.provider),
            model: key.model,
            base_url: key.base_url,
            monthly_token_limit: key.monthly_token_limit.map(int32).transpose()?,
        })
    }
}

#[derive(SimpleObject)]
#[graphql(name = "LlmUsageSummary")]
pub struct LlmUsageSummaryObject {
    provider: Option<String>,
    request_count: Option<i32>,
    prompt_tokens: Option<i32>,
    completion_tokens: Option<i32>,
    cache_read_tokens: Option<i32>,
    cache_write_tokens: Option<i32>,
    last_used_at: Option<String>,
    monthly_token_limit: Option<i32>,
    limit_reached: Option<bool>,
}

impl LlmUsageSummaryObject {
    fn from_summary(summary: LlmUsageSummaryWithLimit) -> Result<Self> {
        Ok(Self {
            provider: Some(summary.provider),
            request_count: Some(int32(summary.request_count)?),
            prompt_tokens: Some(int32(summary.prompt_tokens)?),
            completion_tokens: Some(int32(summary.completion_tokens)?),
            cache_read_tokens: Some(int32(summary.cache_read_tokens)?),
            cache_write_tokens: Some(int32(summary.cache_write_tokens)?),
            last_used_at: Some(iso(summary.last_used_at)),
            monthly_token_limit: summary.monthly_token_limit.map(int32).transpose()?,
            limit_reached: Some(summary.limit_reached),
        })
    }
}

#[derive(SimpleObject)]
#[graphql(name = "TestLlmApiKeyResult")]
pub struct TestLlmApiKeyResultObject {
    ok: Option<bool>,
    error: Option<String>,
}

impl From<TestLlmApiKeyResult> for TestLlmApiKeyResultObject {
    fn from(result: TestLlmApiKeyResult) -> Self {
        Self { ok: Some(result.ok), error: result.error }
    }
}

#[derive(Default)]
pub struct LlmKeysQuery;

#[Object]
impl LlmKeysQuery {
    async fn llm_api_keys(&self, ctx: &Context<'_>) -> Result<Option<Vec<LlmApiKeyObject>>> {
        let user = require_user(ctx)?;
        let keys = container(ctx).list_llm_api_keys_use_case().execute(&user.sub).await.gql()?;
        Ok(Some(keys.into_iter().map(LlmApiKeyObject::from_key).collect::<Result<_>>()?))
    }

    async fn llm_usage_summary(
        &self,
        ctx: &Context<'_>,
    ) -> Result<Option<Vec<LlmUsageSummaryObject>>> {
        let user = require_user(ctx)?;
        let summaries =
            container(ctx).get_llm_usage_summary_use_case().execute(&user.sub).await.gql()?;
        Ok(Some(
            summaries
                .into_iter()
                .map(LlmUsageSummaryObject::from_summary)
                .collect::<Result<_>>()?,
        ))
    }
}

#[derive(Default)]
pub struct LlmKeysMutation;

#[Object]
impl LlmKeysMutation {
    async fn save_llm_api_key(
        &self,
        ctx: &Context<'_>,
        provider: String,
        api_key: String,
        model: Option<String>,
        base_url: Option<String>,
    ) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        container(ctx)
            .save_llm_api_key_use_case()
            .execute(SaveLlmApiKeyInput {
                user_id: user.sub.clone(),
                provider,
                api_key,
                model,
                base_url,
            })
            .await
            .gql()?;
        Ok(Some(true))
    }

    async fn delete_llm_api_key(
        &self,
        ctx: &Context<'_>,
        provider: String,
    ) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        container(ctx)
            .delete_llm_api_key_use_case()
            .execute(DeleteLlmApiKeyInput { user_id: user.sub.clone(), provider })
            .await
            .gql()?;
        Ok(Some(true))
    }

    async fn set_default_llm_provider(
        &self,
        ctx: &Context<'_>,
        provider: String,
    ) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        container(ctx)
            .set_default_llm_provider_use_case()
            .execute(SetDefaultLlmProviderInput { user_id: user.sub.clone(), provider })
            .await
            .gql()?;
        Ok(Some(true))
    }

    // Omitting `monthlyTokenLimit` (or passing null) clears the limit.
    #[graphql(name = "setLlmApiKeyMonthlyLimit")]
    async fn set_llm_api_key_monthly_limit(
        &self,
        ctx: &Context<'_>,
        provider: String,
        monthly_token_limit: Option<i32>,
    ) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        container(ctx)
            .set_llm_api_key_monthly_limit_use_case()
            .execute(SetLlmApiKeyMonthlyLimitInput {
                user_id: user.sub.clone(),
                provider,
                monthly_token_limit: monthly_token_limit.map(i64::from),
            })
            .await
            .gql()?;
        Ok(Some(true))
    }

    async fn test_llm_api_key(
        &self,
        ctx: &Context<'_>,
        provider: String,
        api_key: Option<String>,
        model: Option<String>,
        base_url: Option<String>,
    ) -> Result<Option<TestLlmApiKeyResultObject>> {
        let user = require_user(ctx)?;
        let result = container(ctx)
            .test_llm_api_key_use_case()
            .execute(TestLlmApiKeyInput {
                user_id: user.sub.clone(),
                provider,
                api_key,
                model,
                base_url,
            })
            .await
            .gql()?;
        Ok(Some(result.into()))
    }
}
