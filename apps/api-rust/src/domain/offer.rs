use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum OfferPeriod {
    Yearly,
    Monthly,
    Weekly,
    Hourly,
}

impl OfferPeriod {
    pub const ALL: [Self; 4] = [Self::Yearly, Self::Monthly, Self::Weekly, Self::Hourly];

    /// The value stored in `Offer.period` and sent over GraphQL.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Yearly => "yearly",
            Self::Monthly => "monthly",
            Self::Weekly => "weekly",
            Self::Hourly => "hourly",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|period| period.as_str() == value)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Offer {
    pub id: String,
    pub application_id: String,
    pub base_salary: i64,
    pub bonus: Option<i64>,
    pub equity: Option<String>,
    pub benefits: Option<String>,
    pub cost_of_living_adjustment: Option<i64>,
    pub currency: String,
    pub period: OfferPeriod,
    pub notes: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn period_round_trips_through_its_stored_value() {
        for period in OfferPeriod::ALL {
            assert_eq!(OfferPeriod::parse(period.as_str()), Some(period));
        }
    }

    #[test]
    fn an_unknown_period_does_not_parse() {
        assert_eq!(OfferPeriod::parse("daily"), None);
    }
}
