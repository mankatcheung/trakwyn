use std::cmp::Reverse;
use std::collections::HashMap;
use std::sync::Arc;

use chrono::{DateTime, Utc};

use super::normalize::normalize_to_yearly;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{ApplicationRepository, FindApplicationsFilters, OfferRepository};

#[derive(Debug, Clone, PartialEq)]
pub struct OfferTrendPoint {
    pub offer_id: String,
    pub application_id: String,
    pub company: String,
    pub role: String,
    pub created_at: DateTime<Utc>,
    pub currency: String,
    pub normalized_yearly_salary: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CurrencyGroupStat {
    pub currency: String,
    pub count: i32,
    pub min_yearly_salary: f64,
    pub max_yearly_salary: f64,
    pub median_yearly_salary: f64,
    pub average_yearly_salary: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct OfferAnalytics {
    pub trend: Vec<OfferTrendPoint>,
    pub by_currency: Vec<CurrencyGroupStat>,
}

pub struct GetOfferAnalyticsInput {
    pub user_id: String,
}

/// `salaries` is never empty: a group exists only once it has an offer.
fn median(salaries: &[f64]) -> f64 {
    let mut sorted = salaries.to_vec();
    sorted.sort_by(f64::total_cmp);
    let mid = sorted.len() / 2;
    if sorted.len().is_multiple_of(2) {
        (sorted[mid - 1] + sorted[mid]) / 2.0
    } else {
        sorted[mid]
    }
}

fn average(salaries: &[f64]) -> f64 {
    salaries.iter().sum::<f64>() / salaries.len() as f64
}

/// Every offer a user has logged as a chronological trend, plus
/// min/max/median/average figures.
///
/// `baseSalary` is annualized with the conversion the offer comparison uses,
/// so offers on different pay periods are comparable. There is no FX
/// conversion: offers are grouped by currency and compared only within their
/// group, rather than combining currencies that do not mix.
pub struct GetOfferAnalyticsUseCase {
    pub offer_repository: Arc<dyn OfferRepository>,
    pub application_repository: Arc<dyn ApplicationRepository>,
}

impl GetOfferAnalyticsUseCase {
    pub async fn execute(&self, input: GetOfferAnalyticsInput) -> DomainResult<OfferAnalytics> {
        let mut offers = self.offer_repository.find_all_by_user_id(&input.user_id).await?;
        let applications = self
            .application_repository
            .find_all_by_user_id(&input.user_id, FindApplicationsFilters::default())
            .await?;

        let application_by_id: HashMap<&str, _> =
            applications.iter().map(|application| (application.id.as_str(), application)).collect();
        // Stable, so offers created in the same millisecond keep their order.
        offers.sort_by_key(|offer| offer.created_at);

        let mut trend = Vec::new();
        // In order of first appearance, which the count sort below preserves
        // between groups of the same size.
        let mut yearly_salaries_by_currency: Vec<(String, Vec<f64>)> = Vec::new();

        for offer in offers {
            let Some(application) = application_by_id.get(offer.application_id.as_str()) else {
                continue;
            };

            let normalized_yearly_salary =
                normalize_to_yearly(offer.base_salary, offer.period) as f64;

            match yearly_salaries_by_currency
                .iter_mut()
                .find(|(currency, _)| *currency == offer.currency)
            {
                Some((_, salaries)) => salaries.push(normalized_yearly_salary),
                None => yearly_salaries_by_currency
                    .push((offer.currency.clone(), vec![normalized_yearly_salary])),
            }

            trend.push(OfferTrendPoint {
                offer_id: offer.id,
                application_id: offer.application_id,
                company: application.company.clone(),
                role: application.role.clone(),
                created_at: offer.created_at,
                currency: offer.currency,
                normalized_yearly_salary,
            });
        }

        let mut by_currency: Vec<CurrencyGroupStat> = yearly_salaries_by_currency
            .into_iter()
            .map(|(currency, salaries)| CurrencyGroupStat {
                currency,
                count: salaries.len() as i32,
                min_yearly_salary: salaries.iter().copied().fold(f64::INFINITY, f64::min),
                max_yearly_salary: salaries.iter().copied().fold(f64::NEG_INFINITY, f64::max),
                median_yearly_salary: median(&salaries),
                average_yearly_salary: average(&salaries),
            })
            .collect();
        by_currency.sort_by_key(|stat| Reverse(stat.count));

        Ok(OfferAnalytics { trend, by_currency })
    }
}
