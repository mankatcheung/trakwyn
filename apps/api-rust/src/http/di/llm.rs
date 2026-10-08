use std::sync::Arc;

use crate::http::container::Container;
use crate::infrastructure::llm::limit_enforcing_llm_provider_factory::LimitEnforcingLLMProviderFactory;
use crate::infrastructure::llm::user_llm_provider_factory::UserLLMProviderFactory;
use crate::use_cases::llm_keys::{
    DeleteLlmApiKeyUseCase, GetLlmUsageSummaryUseCase, ListLlmApiKeysUseCase, SaveLlmApiKeyUseCase,
    SetDefaultLlmProviderUseCase, SetLlmApiKeyMonthlyLimitUseCase, TestLlmApiKeyUseCase,
};
use crate::use_cases::ports::LLMProviderFactory;
use crate::use_cases::shared::token_limit::system_now;

impl Container {
    /// The factory every AI feature resolves its provider through: the
    /// per-user factory wrapped by the monthly-limit decorator, as
    /// `apps/api` registers `llmProviderFactory`.
    ///
    /// TODO(wiring): this is a `SINGLETON` in `apps/api`. It is rebuilt per
    /// call here only because `Services` could not be edited in the change
    /// that added it; it holds nothing but the `Arc`s below, so the rebuild
    /// is behaviourally invisible. Move it to a `Services` field.
    pub fn llm_provider_factory(&self) -> Arc<dyn LLMProviderFactory> {
        let user_llm_provider_factory = Arc::new(UserLLMProviderFactory {
            user_repository: self.user_repository.clone(),
            llm_api_key_repository: self.llm_api_key_repository.clone(),
            llm_api_key_cipher: self.services.llm_api_key_cipher.clone(),
            llm_usage_event_repository: self.llm_usage_event_repository.clone(),
            outbound_url_policy: self.services.outbound_url_policy.clone(),
            generate_id: self.generate_id.clone(),
            logger: self.services.logger.clone(),
            transport: self.services.llm_transport.clone(),
        });
        Arc::new(LimitEnforcingLLMProviderFactory {
            user_llm_provider_factory,
            user_repository: self.user_repository.clone(),
            llm_api_key_repository: self.llm_api_key_repository.clone(),
            llm_usage_event_repository: self.llm_usage_event_repository.clone(),
            now: system_now(),
        })
    }

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
            llm_provider_factory: self.llm_provider_factory(),
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
