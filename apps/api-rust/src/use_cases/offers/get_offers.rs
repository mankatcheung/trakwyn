use std::sync::Arc;

use crate::domain::offer::Offer;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{ApplicationRepository, OfferRepository};

pub struct GetOffersInput {
    pub user_id: String,
    pub application_id: String,
}

pub struct GetOffersUseCase {
    pub offer_repository: Arc<dyn OfferRepository>,
    pub application_repository: Arc<dyn ApplicationRepository>,
}

impl GetOffersUseCase {
    pub async fn execute(&self, input: GetOffersInput) -> DomainResult<Vec<Offer>> {
        // Someone else's application reads as missing, not as Forbidden.
        let application = self.application_repository.find_by_id(&input.application_id).await?;
        if application.is_none_or(|application| application.user_id != input.user_id) {
            return Err(DomainError::not_found("Application not found"));
        }

        self.offer_repository.find_all_by_application_id(&input.application_id).await
    }
}
