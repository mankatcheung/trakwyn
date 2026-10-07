use std::sync::Arc;

use super::normalize::normalize_to_yearly;
use crate::domain::offer::Offer;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{ApplicationRepository, OfferRepository};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OfferComparison {
    pub offer: Offer,
    pub company: String,
    pub role: String,
    pub normalized_yearly_salary: i64,
    pub total_compensation: i64,
}

pub struct CompareOffersInput {
    pub user_id: String,
    pub offer_ids: Vec<String>,
}

pub struct CompareOffersUseCase {
    pub offer_repository: Arc<dyn OfferRepository>,
    pub application_repository: Arc<dyn ApplicationRepository>,
}

impl CompareOffersUseCase {
    pub async fn execute(&self, input: CompareOffersInput) -> DomainResult<Vec<OfferComparison>> {
        let mut comparisons = Vec::with_capacity(input.offer_ids.len());

        for offer_id in &input.offer_ids {
            let offer = self
                .offer_repository
                .find_by_id(offer_id)
                .await?
                .ok_or_else(|| DomainError::not_found(format!("Offer {offer_id} not found")))?;

            let application = self
                .application_repository
                .find_by_id(&offer.application_id)
                .await?
                .filter(|application| application.user_id == input.user_id)
                .ok_or_else(|| {
                    DomainError::forbidden(format!("Not authorized for offer {offer_id}"))
                })?;

            let normalized_yearly_salary = normalize_to_yearly(offer.base_salary, offer.period);
            // The bonus is read as paid per period too, as in the original.
            let yearly_bonus =
                offer.bonus.map_or(0, |bonus| normalize_to_yearly(bonus, offer.period));
            let total_compensation = normalized_yearly_salary.saturating_add(yearly_bonus);

            comparisons.push(OfferComparison {
                offer,
                company: application.company,
                role: application.role,
                normalized_yearly_salary,
                total_compensation,
            });
        }

        // Highest total first; a stable sort, so ties keep the order asked for.
        comparisons.sort_by(|a, b| b.total_compensation.cmp(&a.total_compensation));

        Ok(comparisons)
    }
}
