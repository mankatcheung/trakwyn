use std::sync::Mutex;

use async_trait::async_trait;

use crate::domain::cookie_consent::CookieConsent;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{CookieConsentRepository, CreateCookieConsentData};

#[derive(Default)]
pub struct FakeCookieConsentRepository {
    consents: Mutex<Vec<CookieConsent>>,
}

impl FakeCookieConsentRepository {
    pub fn all(&self) -> Vec<CookieConsent> {
        self.consents.lock().unwrap().clone()
    }
}

#[async_trait]
impl CookieConsentRepository for FakeCookieConsentRepository {
    async fn create(&self, data: CreateCookieConsentData) -> DomainResult<CookieConsent> {
        let consent = CookieConsent {
            id: data.id,
            analytics_accepted: data.analytics_accepted,
            ip_address: data.ip_address,
            user_agent: data.user_agent,
            consented_at: now(),
        };
        self.consents.lock().unwrap().push(consent.clone());
        Ok(consent)
    }
}
