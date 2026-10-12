use async_trait::async_trait;

use crate::domain::cookie_consent::CookieConsent;
use crate::use_cases::errors::DomainResult;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateCookieConsentData {
    pub id: String,
    pub analytics_accepted: bool,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
}

#[async_trait]
pub trait CookieConsentRepository: Send + Sync {
    async fn create(&self, data: CreateCookieConsentData) -> DomainResult<CookieConsent>;
}
