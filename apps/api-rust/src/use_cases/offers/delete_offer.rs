use std::sync::Arc;

use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{ApplicationRepository, OfferRepository};

pub struct DeleteOfferInput {
    pub user_id: String,
    pub offer_id: String,
}

pub struct DeleteOfferUseCase {
    pub offer_repository: Arc<dyn OfferRepository>,
    pub application_repository: Arc<dyn ApplicationRepository>,
}

impl DeleteOfferUseCase {
    pub async fn execute(&self, input: DeleteOfferInput) -> DomainResult<()> {
        let offer = self
            .offer_repository
            .find_by_id(&input.offer_id)
            .await?
            .ok_or_else(|| DomainError::not_found("Offer not found"))?;

        let application = self.application_repository.find_by_id(&offer.application_id).await?;
        if application.is_none_or(|application| application.user_id != input.user_id) {
            return Err(DomainError::forbidden("Not authorized"));
        }

        self.offer_repository.delete(&input.offer_id).await
    }
}
