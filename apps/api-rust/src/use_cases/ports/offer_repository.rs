use async_trait::async_trait;

use crate::domain::offer::{Offer, OfferPeriod};
use crate::use_cases::errors::DomainResult;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CreateOfferData {
    pub id: String,
    pub application_id: String,
    pub base_salary: i64,
    pub bonus: Option<i64>,
    pub equity: Option<String>,
    pub benefits: Option<String>,
    pub cost_of_living_adjustment: Option<i64>,
    /// `None` stores `USD`.
    pub currency: Option<String>,
    /// `None` stores `yearly`.
    pub period: Option<OfferPeriod>,
    pub notes: Option<String>,
}

/// A field left `None` is not written. For a nullable column, `Some(None)`
/// writes null.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct UpdateOfferData {
    pub base_salary: Option<i64>,
    pub bonus: Option<Option<i64>>,
    pub equity: Option<Option<String>>,
    pub benefits: Option<Option<String>>,
    pub cost_of_living_adjustment: Option<Option<i64>>,
    pub currency: Option<String>,
    pub period: Option<OfferPeriod>,
    pub notes: Option<Option<String>>,
}

#[async_trait]
pub trait OfferRepository: Send + Sync {
    /// In no promised order.
    async fn find_all_by_application_id(&self, application_id: &str) -> DomainResult<Vec<Offer>>;
    async fn count_by_application_id(&self, application_id: &str) -> DomainResult<i64>;
    /// Across every live application owned by the user, for cross-application
    /// analytics.
    async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<Offer>>;
    async fn find_by_id(&self, id: &str) -> DomainResult<Option<Offer>>;
    async fn create(&self, data: CreateOfferData) -> DomainResult<Offer>;
    async fn update(&self, id: &str, data: UpdateOfferData) -> DomainResult<Offer>;
    async fn delete(&self, id: &str) -> DomainResult<()>;
}
