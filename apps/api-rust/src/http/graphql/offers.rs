use async_graphql::{ComplexObject, Context, Error, InputObject, Object, Result, SimpleObject, ID};

use super::support::{container, iso, require_user};
use crate::domain::offer::Offer;
use crate::http::errors::GraphQLResultExt;
use crate::use_cases::offers::{
    CompareOffersInput, CreateOfferInput, CurrencyGroupStat, DeleteOfferInput, GetAllOffersInput,
    GetOfferAnalyticsInput, GetOffersInput, OfferAnalytics, OfferComparison, OfferTrendPoint,
    OfferWithApplication, UpdateOfferInput,
};

/// Amounts are `bigint` in the database and `Int` in the contract. One that
/// does not fit fails that field alone, with the message graphql-js gives
/// when it refuses to serialize it.
fn int(value: i64) -> Result<Option<i32>> {
    i32::try_from(value).map(Some).map_err(|_| {
        Error::new(format!("Int cannot represent non 32-bit signed integer value: {value}"))
    })
}

#[derive(SimpleObject)]
#[graphql(name = "Offer", complex)]
pub struct OfferObject {
    id: Option<ID>,
    application_id: Option<ID>,
    #[graphql(skip)]
    raw_base_salary: i64,
    #[graphql(skip)]
    raw_bonus: Option<i64>,
    equity: Option<String>,
    benefits: Option<String>,
    #[graphql(skip)]
    raw_cost_of_living_adjustment: Option<i64>,
    currency: Option<String>,
    period: Option<String>,
    notes: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
}

#[ComplexObject]
impl OfferObject {
    async fn base_salary(&self) -> Result<Option<i32>> {
        int(self.raw_base_salary)
    }

    async fn bonus(&self) -> Result<Option<i32>> {
        self.raw_bonus.map_or(Ok(None), int)
    }

    async fn cost_of_living_adjustment(&self) -> Result<Option<i32>> {
        self.raw_cost_of_living_adjustment.map_or(Ok(None), int)
    }
}

impl From<Offer> for OfferObject {
    fn from(offer: Offer) -> Self {
        Self {
            id: Some(ID(offer.id)),
            application_id: Some(ID(offer.application_id)),
            raw_base_salary: offer.base_salary,
            raw_bonus: offer.bonus,
            equity: offer.equity,
            benefits: offer.benefits,
            raw_cost_of_living_adjustment: offer.cost_of_living_adjustment,
            currency: Some(offer.currency),
            period: Some(offer.period.as_str().to_string()),
            notes: offer.notes,
            created_at: Some(iso(offer.created_at)),
            updated_at: Some(iso(offer.updated_at)),
        }
    }
}

#[derive(SimpleObject)]
#[graphql(name = "OfferWithApplication")]
pub struct OfferWithApplicationObject {
    offer: Option<OfferObject>,
    company: Option<String>,
    role: Option<String>,
}

impl From<OfferWithApplication> for OfferWithApplicationObject {
    fn from(entry: OfferWithApplication) -> Self {
        Self {
            offer: Some(entry.offer.into()),
            company: Some(entry.company),
            role: Some(entry.role),
        }
    }
}

#[derive(SimpleObject)]
#[graphql(name = "OfferComparison", complex)]
pub struct OfferComparisonObject {
    offer: Option<OfferObject>,
    company: Option<String>,
    role: Option<String>,
    #[graphql(skip)]
    raw_normalized_yearly_salary: i64,
    #[graphql(skip)]
    raw_total_compensation: i64,
}

#[ComplexObject]
impl OfferComparisonObject {
    async fn normalized_yearly_salary(&self) -> Result<Option<i32>> {
        int(self.raw_normalized_yearly_salary)
    }

    async fn total_compensation(&self) -> Result<Option<i32>> {
        int(self.raw_total_compensation)
    }
}

impl From<OfferComparison> for OfferComparisonObject {
    fn from(comparison: OfferComparison) -> Self {
        Self {
            offer: Some(comparison.offer.into()),
            company: Some(comparison.company),
            role: Some(comparison.role),
            raw_normalized_yearly_salary: comparison.normalized_yearly_salary,
            raw_total_compensation: comparison.total_compensation,
        }
    }
}

#[derive(SimpleObject)]
#[graphql(name = "OfferTrendPoint")]
pub struct OfferTrendPointObject {
    offer_id: Option<ID>,
    application_id: Option<ID>,
    company: Option<String>,
    role: Option<String>,
    created_at: Option<String>,
    currency: Option<String>,
    normalized_yearly_salary: Option<f64>,
}

impl From<OfferTrendPoint> for OfferTrendPointObject {
    fn from(point: OfferTrendPoint) -> Self {
        Self {
            offer_id: Some(ID(point.offer_id)),
            application_id: Some(ID(point.application_id)),
            company: Some(point.company),
            role: Some(point.role),
            created_at: Some(iso(point.created_at)),
            currency: Some(point.currency),
            normalized_yearly_salary: Some(point.normalized_yearly_salary),
        }
    }
}

#[derive(SimpleObject)]
#[graphql(name = "CurrencyGroupStat")]
pub struct CurrencyGroupStatObject {
    currency: Option<String>,
    count: Option<i32>,
    min_yearly_salary: Option<f64>,
    max_yearly_salary: Option<f64>,
    median_yearly_salary: Option<f64>,
    average_yearly_salary: Option<f64>,
}

impl From<CurrencyGroupStat> for CurrencyGroupStatObject {
    fn from(stat: CurrencyGroupStat) -> Self {
        Self {
            currency: Some(stat.currency),
            count: Some(stat.count),
            min_yearly_salary: Some(stat.min_yearly_salary),
            max_yearly_salary: Some(stat.max_yearly_salary),
            median_yearly_salary: Some(stat.median_yearly_salary),
            average_yearly_salary: Some(stat.average_yearly_salary),
        }
    }
}

#[derive(SimpleObject)]
#[graphql(name = "OfferAnalytics")]
pub struct OfferAnalyticsObject {
    trend: Option<Vec<OfferTrendPointObject>>,
    by_currency: Option<Vec<CurrencyGroupStatObject>>,
}

impl From<OfferAnalytics> for OfferAnalyticsObject {
    fn from(analytics: OfferAnalytics) -> Self {
        Self {
            trend: Some(analytics.trend.into_iter().map(Into::into).collect()),
            by_currency: Some(analytics.by_currency.into_iter().map(Into::into).collect()),
        }
    }
}

fn default_currency() -> Option<String> {
    Some("USD".to_string())
}

fn default_period() -> Option<String> {
    Some("yearly".to_string())
}

// `currency` and `period` carry their defaults in the contract; an explicit
// `null` reaches the repository as "not named", which stores the same values.
#[derive(InputObject)]
#[graphql(name = "CreateOfferInput")]
pub struct CreateOfferInputObject {
    application_id: ID,
    base_salary: i32,
    bonus: Option<i32>,
    equity: Option<String>,
    benefits: Option<String>,
    cost_of_living_adjustment: Option<i32>,
    #[graphql(default_with = "default_currency()")]
    currency: Option<String>,
    #[graphql(default_with = "default_period()")]
    period: Option<String>,
    notes: Option<String>,
}

// A `null` field reads as left out: this input cannot clear a column.
#[derive(InputObject)]
#[graphql(name = "UpdateOfferInput")]
pub struct UpdateOfferInputObject {
    offer_id: ID,
    base_salary: Option<i32>,
    bonus: Option<i32>,
    equity: Option<String>,
    benefits: Option<String>,
    cost_of_living_adjustment: Option<i32>,
    currency: Option<String>,
    period: Option<String>,
    notes: Option<String>,
}

#[derive(Default)]
pub struct OffersQuery;

#[Object]
impl OffersQuery {
    async fn offers(
        &self,
        ctx: &Context<'_>,
        application_id: ID,
    ) -> Result<Option<Vec<OfferObject>>> {
        let user = require_user(ctx)?;
        let offers = container(ctx)
            .get_offers_use_case()
            .execute(GetOffersInput { user_id: user.sub.clone(), application_id: application_id.0 })
            .await
            .gql()?;
        Ok(Some(offers.into_iter().map(OfferObject::from).collect()))
    }

    async fn my_offers(
        &self,
        ctx: &Context<'_>,
    ) -> Result<Option<Vec<OfferWithApplicationObject>>> {
        let user = require_user(ctx)?;
        let offers = container(ctx)
            .get_all_offers_use_case()
            .execute(GetAllOffersInput { user_id: user.sub.clone() })
            .await
            .gql()?;
        Ok(Some(offers.into_iter().map(OfferWithApplicationObject::from).collect()))
    }

    async fn offer_analytics(&self, ctx: &Context<'_>) -> Result<Option<OfferAnalyticsObject>> {
        let user = require_user(ctx)?;
        let analytics = container(ctx)
            .get_offer_analytics_use_case()
            .execute(GetOfferAnalyticsInput { user_id: user.sub.clone() })
            .await
            .gql()?;
        Ok(Some(analytics.into()))
    }
}

#[derive(Default)]
pub struct OffersMutation;

#[Object]
impl OffersMutation {
    async fn create_offer(
        &self,
        ctx: &Context<'_>,
        input: CreateOfferInputObject,
    ) -> Result<Option<OfferObject>> {
        let user = require_user(ctx)?;
        let offer = container(ctx)
            .create_offer_use_case()
            .execute(CreateOfferInput {
                user_id: user.sub.clone(),
                application_id: input.application_id.0,
                base_salary: i64::from(input.base_salary),
                bonus: input.bonus.map(i64::from),
                equity: input.equity,
                benefits: input.benefits,
                cost_of_living_adjustment: input.cost_of_living_adjustment.map(i64::from),
                currency: input.currency,
                period: input.period,
                notes: input.notes,
            })
            .await
            .gql()?;
        Ok(Some(offer.into()))
    }

    async fn update_offer(
        &self,
        ctx: &Context<'_>,
        input: UpdateOfferInputObject,
    ) -> Result<Option<OfferObject>> {
        let user = require_user(ctx)?;
        let offer = container(ctx)
            .update_offer_use_case()
            .execute(UpdateOfferInput {
                user_id: user.sub.clone(),
                offer_id: input.offer_id.0,
                base_salary: input.base_salary.map(i64::from),
                bonus: input.bonus.map(|bonus| Some(i64::from(bonus))),
                equity: input.equity.map(Some),
                benefits: input.benefits.map(Some),
                cost_of_living_adjustment: input
                    .cost_of_living_adjustment
                    .map(|adjustment| Some(i64::from(adjustment))),
                currency: input.currency,
                period: input.period,
                notes: input.notes.map(Some),
            })
            .await
            .gql()?;
        Ok(Some(offer.into()))
    }

    // The one delete whose `id` is a `String`, as the contract has it.
    async fn delete_offer(&self, ctx: &Context<'_>, id: String) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        container(ctx)
            .delete_offer_use_case()
            .execute(DeleteOfferInput { user_id: user.sub.clone(), offer_id: id })
            .await
            .gql()?;
        Ok(Some(true))
    }

    async fn compare_offers(
        &self,
        ctx: &Context<'_>,
        offer_ids: Vec<String>,
    ) -> Result<Option<Vec<OfferComparisonObject>>> {
        let user = require_user(ctx)?;
        let comparisons = container(ctx)
            .compare_offers_use_case()
            .execute(CompareOffersInput { user_id: user.sub.clone(), offer_ids })
            .await
            .gql()?;
        Ok(Some(comparisons.into_iter().map(OfferComparisonObject::from).collect()))
    }
}
