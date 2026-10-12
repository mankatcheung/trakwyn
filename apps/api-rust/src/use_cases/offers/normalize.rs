//! The yearly-equivalent conversion the offer comparison and the offer
//! analytics share (the original states it once in each).

use crate::domain::offer::OfferPeriod;
use crate::use_cases::constants::offer_normalization;
use crate::use_cases::errors::{DomainError, DomainResult};

/// An amount paid per `period`, as an amount per year. Saturates instead of
/// wrapping: a figure that large is already outside anything a client shows.
pub fn normalize_to_yearly(amount: i64, period: OfferPeriod) -> i64 {
    let periods_per_year = match period {
        OfferPeriod::Yearly => 1,
        OfferPeriod::Monthly => offer_normalization::MONTHS_PER_YEAR,
        OfferPeriod::Weekly => offer_normalization::WEEKS_PER_YEAR,
        OfferPeriod::Hourly => offer_normalization::WORKING_HOURS_PER_YEAR,
    };
    amount.saturating_mul(periods_per_year)
}

/// The period a caller named. The original stores any string; here
/// `Offer.period` is a closed set, so a value outside it is refused rather
/// than written as a row nothing could read back.
pub fn parse_period(period: Option<&str>) -> DomainResult<Option<OfferPeriod>> {
    period
        .map(|value| {
            OfferPeriod::parse(value).ok_or_else(|| {
                let allowed: Vec<&str> =
                    OfferPeriod::ALL.iter().map(|period| period.as_str()).collect();
                DomainError::validation(format!(
                    "Invalid offer period. Must be one of: {}",
                    allowed.join(", ")
                ))
            })
        })
        .transpose()
}
