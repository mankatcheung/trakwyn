use std::collections::HashMap;
use std::sync::Arc;

use crate::domain::llm_usage_event::LlmUsageSummaryWithLimit;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{LlmApiKeyRepository, LlmUsageEventRepository};
use crate::use_cases::shared::token_limit::{is_limit_reached, start_of_utc_month, Now};

/// "This calendar month" is the policy decision that lives in
/// `shared::token_limit`, not in the repository: usage resets monthly by
/// construction (nothing to sum before the 1st), no cron job or deletion
/// required.
///
/// Each provider's summary carries the ceiling set on its key and whether it
/// has been passed (JEF-258), decided by the same helper the provider
/// factory refuses on. A provider with a key but no usage this month simply
/// has no row here (it cannot have reached a limit), so the settings page
/// reads the ceiling itself off `LlmApiKey.monthlyTokenLimit`.
pub struct GetLlmUsageSummaryUseCase {
    pub llm_usage_event_repository: Arc<dyn LlmUsageEventRepository>,
    pub llm_api_key_repository: Arc<dyn LlmApiKeyRepository>,
    pub now: Now,
}

impl GetLlmUsageSummaryUseCase {
    pub async fn execute(&self, user_id: &str) -> DomainResult<Vec<LlmUsageSummaryWithLimit>> {
        let since = start_of_utc_month((self.now)());
        let summaries =
            self.llm_usage_event_repository.summarize_by_user_id(user_id, since).await?;
        let keys = self.llm_api_key_repository.find_all_by_user_id(user_id).await?;

        let limit_by_provider: HashMap<String, Option<i64>> =
            keys.into_iter().map(|key| (key.provider, key.monthly_token_limit)).collect();

        Ok(summaries
            .into_iter()
            .map(|summary| {
                let monthly_token_limit =
                    limit_by_provider.get(&summary.provider).copied().flatten();
                LlmUsageSummaryWithLimit {
                    limit_reached: is_limit_reached(
                        summary.prompt_tokens + summary.completion_tokens,
                        monthly_token_limit,
                    ),
                    monthly_token_limit,
                    provider: summary.provider,
                    request_count: summary.request_count,
                    prompt_tokens: summary.prompt_tokens,
                    completion_tokens: summary.completion_tokens,
                    cache_read_tokens: summary.cache_read_tokens,
                    cache_write_tokens: summary.cache_write_tokens,
                    last_used_at: summary.last_used_at,
                }
            })
            .collect())
    }
}
