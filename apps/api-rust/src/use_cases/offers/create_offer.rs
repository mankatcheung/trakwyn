use std::sync::Arc;

use super::normalize::parse_period;
use crate::domain::offer::Offer;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{ApplicationRepository, CreateOfferData, OfferRepository};

#[derive(Debug, Clone, Default)]
pub struct CreateOfferInput {
    pub user_id: String,
    pub application_id: String,
    pub base_salary: i64,
    pub bonus: Option<i64>,
    pub equity: Option<String>,
    pub benefits: Option<String>,
    pub cost_of_living_adjustment: Option<i64>,
    pub currency: Option<String>,
    pub period: Option<String>,
    pub notes: Option<String>,
}

pub struct CreateOfferUseCase {
    pub offer_repository: Arc<dyn OfferRepository>,
    pub application_repository: Arc<dyn ApplicationRepository>,
    /// Offer ids are UUIDs in the original (`crypto.randomUUID()`), not the
    /// nanoids every other entity gets, so this takes its own generator.
    pub generate_offer_id: GenerateId,
}

impl CreateOfferUseCase {
    pub async fn execute(&self, input: CreateOfferInput) -> DomainResult<Offer> {
        // Someone else's application reads as missing here, unlike the other
        // per-application creates, which answer Forbidden.
        let application = self.application_repository.find_by_id(&input.application_id).await?;
        if application.is_none_or(|application| application.user_id != input.user_id) {
            return Err(DomainError::not_found("Application not found"));
        }
        let period = parse_period(input.period.as_deref())?;

        self.offer_repository
            .create(CreateOfferData {
                id: (self.generate_offer_id)(),
                application_id: input.application_id,
                base_salary: input.base_salary,
                bonus: input.bonus,
                equity: input.equity,
                benefits: input.benefits,
                cost_of_living_adjustment: input.cost_of_living_adjustment,
                currency: input.currency,
                period,
                notes: input.notes,
            })
            .await
    }
}
