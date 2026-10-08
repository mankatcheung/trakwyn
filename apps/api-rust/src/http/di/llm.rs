use std::sync::Arc;

use crate::http::container::Container;
use crate::http::services::Services;
use crate::infrastructure::llm::limit_enforcing_llm_provider_factory::LimitEnforcingLLMProviderFactory;
use crate::infrastructure::llm::user_llm_provider_factory::UserLLMProviderFactory;
use crate::use_cases::ids::GenerateId;
use crate::use_cases::llm_keys::{
    DeleteLlmApiKeyUseCase, GetLlmUsageSummaryUseCase, ListLlmApiKeysUseCase, SaveLlmApiKeyUseCase,
    SetDefaultLlmProviderUseCase, SetLlmApiKeyMonthlyLimitUseCase, TestLlmApiKeyUseCase,
};
use crate::use_cases::ports::{
    LLMProviderFactory, LlmApiKeyRepository, LlmUsageEventRepository, UserRepository,
};
use crate::use_cases::shared::token_limit::system_now;

/// The factory every AI feature resolves its provider through: the per-user
/// factory wrapped by the monthly-limit decorator, as `apps/api` registers
/// `llmProviderFactory`.
pub fn build_llm_provider_factory(
    user_repository: &Arc<dyn UserRepository>,
    llm_api_key_repository: &Arc<dyn LlmApiKeyRepository>,
    llm_usage_event_repository: &Arc<dyn LlmUsageEventRepository>,
    services: &Services,
    generate_id: &GenerateId,
) -> Arc<dyn LLMProviderFactory> {
    let user_llm_provider_factory = Arc::new(UserLLMProviderFactory {
        user_repository: user_repository.clone(),
        llm_api_key_repository: llm_api_key_repository.clone(),
        llm_api_key_cipher: services.llm_api_key_cipher.clone(),
        llm_usage_event_repository: llm_usage_event_repository.clone(),
        outbound_url_policy: services.outbound_url_policy.clone(),
        generate_id: generate_id.clone(),
        logger: services.logger.clone(),
        transport: services.llm_transport.clone(),
    });
    Arc::new(LimitEnforcingLLMProviderFactory {
        user_llm_provider_factory,
        user_repository: user_repository.clone(),
        llm_api_key_repository: llm_api_key_repository.clone(),
        llm_usage_event_repository: llm_usage_event_repository.clone(),
        now: system_now(),
    })
}

impl Container {
    pub fn save_llm_api_key_use_case(&self) -> SaveLlmApiKeyUseCase {
        SaveLlmApiKeyUseCase {
            user_repository: self.user_repository.clone(),
            llm_api_key_repository: self.llm_api_key_repository.clone(),
            llm_api_key_cipher: self.services.llm_api_key_cipher.clone(),
            outbound_url_policy: self.services.outbound_url_policy.clone(),
            generate_id: self.generate_id.clone(),
        }
    }

    pub fn list_llm_api_keys_use_case(&self) -> ListLlmApiKeysUseCase {
        ListLlmApiKeysUseCase { llm_api_key_repository: self.llm_api_key_repository.clone() }
    }

    pub fn delete_llm_api_key_use_case(&self) -> DeleteLlmApiKeyUseCase {
        DeleteLlmApiKeyUseCase {
            user_repository: self.user_repository.clone(),
            llm_api_key_repository: self.llm_api_key_repository.clone(),
        }
    }

    pub fn set_default_llm_provider_use_case(&self) -> SetDefaultLlmProviderUseCase {
        SetDefaultLlmProviderUseCase {
            user_repository: self.user_repository.clone(),
            llm_api_key_repository: self.llm_api_key_repository.clone(),
        }
    }

    pub fn set_llm_api_key_monthly_limit_use_case(&self) -> SetLlmApiKeyMonthlyLimitUseCase {
        SetLlmApiKeyMonthlyLimitUseCase {
            llm_api_key_repository: self.llm_api_key_repository.clone(),
        }
    }

    pub fn test_llm_api_key_use_case(&self) -> TestLlmApiKeyUseCase {
        TestLlmApiKeyUseCase {
            llm_provider_factory: self.llm_provider_factory.clone(),
            test_llm_api_key_rate_limiter: self.services.rate_limiters.test_llm_api_key.clone(),
            outbound_url_policy: self.services.outbound_url_policy.clone(),
        }
    }

    pub fn get_llm_usage_summary_use_case(&self) -> GetLlmUsageSummaryUseCase {
        GetLlmUsageSummaryUseCase {
            llm_usage_event_repository: self.llm_usage_event_repository.clone(),
            llm_api_key_repository: self.llm_api_key_repository.clone(),
            now: system_now(),
        }
    }
}
