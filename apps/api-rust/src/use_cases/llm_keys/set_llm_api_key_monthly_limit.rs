use std::sync::Arc;

use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::LlmApiKeyRepository;

pub struct SetLlmApiKeyMonthlyLimitInput {
    pub user_id: String,
    pub provider: String,
    /// `None` clears the limit.
    pub monthly_token_limit: Option<i64>,
}

/// Sets the monthly token ceiling on one of the user's own keys (JEF-258),
/// or clears it.
///
/// Deliberately separate from saving a key: rotating an API key and changing
/// how much you are willing to spend on it are different decisions, and
/// folding them together would mean re-entering the secret to change a
/// number. The repository's `upsert` leaves this column alone for the same
/// reason.
///
/// `apps/api` also refuses a fractional limit ("Monthly token limit must be
/// a whole number"); the value is an integer by type here, so that case
/// cannot arise.
pub struct SetLlmApiKeyMonthlyLimitUseCase {
    pub llm_api_key_repository: Arc<dyn LlmApiKeyRepository>,
}

impl SetLlmApiKeyMonthlyLimitUseCase {
    pub async fn execute(&self, input: SetLlmApiKeyMonthlyLimitInput) -> DomainResult<()> {
        // Zero would be a key that can never be used, which is what removing
        // the key is for, and it reads as "no limit" to anyone skimming.
        if input.monthly_token_limit.is_some_and(|limit| limit < 1) {
            return Err(DomainError::validation("Monthly token limit must be at least 1"));
        }

        let updated = self
            .llm_api_key_repository
            .set_monthly_token_limit(&input.user_id, &input.provider, input.monthly_token_limit)
            .await?;

        if updated.is_none() {
            return Err(DomainError::not_found("No API key configured for this provider"));
        }
        Ok(())
    }
}
