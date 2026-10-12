use std::sync::Arc;

use super::normalize::parse_period;
use crate::domain::offer::Offer;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{ApplicationRepository, OfferRepository, UpdateOfferData};

/// A field left `None` is not written; `Some(None)` clears a nullable one.
#[derive(Debug, Clone, Default)]
pub struct UpdateOfferInput {
    pub user_id: String,
    pub offer_id: String,
    pub base_salary: Option<i64>,
    pub bonus: Option<Option<i64>>,
    pub equity: Option<Option<String>>,
    pub benefits: Option<Option<String>>,
    pub cost_of_living_adjustment: Option<Option<i64>>,
    pub currency: Option<String>,
    pub period: Option<String>,
    pub notes: Option<Option<String>>,
}

pub struct UpdateOfferUseCase {
    pub offer_repository: Arc<dyn OfferRepository>,
    pub application_repository: Arc<dyn ApplicationRepository>,
}

impl UpdateOfferUseCase {
    pub async fn execute(&self, input: UpdateOfferInput) -> DomainResult<Offer> {
        let offer = self
            .offer_repository
            .find_by_id(&input.offer_id)
            .await?
            .ok_or_else(|| DomainError::not_found("Offer not found"))?;

        let application = self.application_repository.find_by_id(&offer.application_id).await?;
        if application.is_none_or(|application| application.user_id != input.user_id) {
            return Err(DomainError::forbidden("Not authorized"));
        }
        let period = parse_period(input.period.as_deref())?;

        self.offer_repository
            .update(
                &input.offer_id,
                UpdateOfferData {
                    base_salary: input.base_salary,
                    bonus: input.bonus,
                    equity: input.equity,
                    benefits: input.benefits,
                    cost_of_living_adjustment: input.cost_of_living_adjustment,
                    currency: input.currency,
                    period,
                    notes: input.notes,
                },
            )
            .await
    }
}
