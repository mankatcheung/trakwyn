use std::collections::HashMap;
use std::sync::Arc;

use crate::domain::offer::Offer;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{ApplicationRepository, FindApplicationsFilters, OfferRepository};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OfferWithApplication {
    pub offer: Offer,
    pub company: String,
    pub role: String,
}

pub struct GetAllOffersInput {
    pub user_id: String,
}

/// Every offer the user has logged, across every (non-trashed) application.
pub struct GetAllOffersUseCase {
    pub offer_repository: Arc<dyn OfferRepository>,
    pub application_repository: Arc<dyn ApplicationRepository>,
}

impl GetAllOffersUseCase {
    pub async fn execute(
        &self,
        input: GetAllOffersInput,
    ) -> DomainResult<Vec<OfferWithApplication>> {
        let offers = self.offer_repository.find_all_by_user_id(&input.user_id).await?;
        let applications = self
            .application_repository
            .find_all_by_user_id(&input.user_id, FindApplicationsFilters::default())
            .await?;

        let application_by_id: HashMap<&str, _> =
            applications.iter().map(|application| (application.id.as_str(), application)).collect();

        Ok(offers
            .into_iter()
            .filter_map(|offer| {
                let application = application_by_id.get(offer.application_id.as_str())?;
                Some(OfferWithApplication {
                    company: application.company.clone(),
                    role: application.role.clone(),
                    offer,
                })
            })
            .collect())
    }
}
