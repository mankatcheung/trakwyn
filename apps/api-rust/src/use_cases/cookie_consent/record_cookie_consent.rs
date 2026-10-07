use std::sync::Arc;

use crate::use_cases::errors::DomainResult;
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{CookieConsentRepository, CreateCookieConsentData};

pub struct RecordCookieConsentInput {
    pub analytics_accepted: bool,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
}

/// Records one visitor's decision for the audit trail. Anonymous by design:
/// the decision is made before, or without, an account existing.
pub struct RecordCookieConsentUseCase {
    pub cookie_consent_repository: Arc<dyn CookieConsentRepository>,
    pub generate_id: GenerateId,
}

impl RecordCookieConsentUseCase {
    pub async fn execute(&self, input: RecordCookieConsentInput) -> DomainResult<()> {
        self.cookie_consent_repository
            .create(CreateCookieConsentData {
                id: (self.generate_id)(),
                analytics_accepted: input.analytics_accepted,
                ip_address: input.ip_address,
                user_agent: input.user_agent,
            })
            .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::use_cases::test_support::{sequential_ids, FakeCookieConsentRepository};

    fn use_case(repository: &Arc<FakeCookieConsentRepository>) -> RecordCookieConsentUseCase {
        RecordCookieConsentUseCase {
            cookie_consent_repository: repository.clone(),
            generate_id: sequential_ids("id"),
        }
    }

    #[tokio::test]
    async fn persists_the_decision_with_a_generated_id() {
        let repository = Arc::new(FakeCookieConsentRepository::default());

        use_case(&repository)
            .execute(RecordCookieConsentInput {
                analytics_accepted: true,
                ip_address: Some("203.0.113.7".to_string()),
                user_agent: Some("Mozilla/5.0".to_string()),
            })
            .await
            .unwrap();

        let consents = repository.all();
        assert_eq!(consents.len(), 1);
        assert_eq!(consents[0].id, "id-1");
        assert!(consents[0].analytics_accepted);
        assert_eq!(consents[0].ip_address.as_deref(), Some("203.0.113.7"));
        assert_eq!(consents[0].user_agent.as_deref(), Some("Mozilla/5.0"));
    }

    #[tokio::test]
    async fn persists_a_rejection_with_null_ip_and_user_agent_unchanged() {
        let repository = Arc::new(FakeCookieConsentRepository::default());

        use_case(&repository)
            .execute(RecordCookieConsentInput {
                analytics_accepted: false,
                ip_address: None,
                user_agent: None,
            })
            .await
            .unwrap();

        let consents = repository.all();
        assert!(!consents[0].analytics_accepted);
        assert_eq!((consents[0].ip_address.clone(), consents[0].user_agent.clone()), (None, None));
    }
}
