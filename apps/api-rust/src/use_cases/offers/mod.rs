pub mod compare_offers;
pub mod create_offer;
pub mod delete_offer;
pub mod get_all_offers;
pub mod get_offer_analytics;
pub mod get_offers;
pub mod normalize;
pub mod update_offer;

pub use compare_offers::{CompareOffersInput, CompareOffersUseCase, OfferComparison};
pub use create_offer::{CreateOfferInput, CreateOfferUseCase};
pub use delete_offer::{DeleteOfferInput, DeleteOfferUseCase};
pub use get_all_offers::{GetAllOffersInput, GetAllOffersUseCase, OfferWithApplication};
pub use get_offer_analytics::{
    CurrencyGroupStat, GetOfferAnalyticsInput, GetOfferAnalyticsUseCase, OfferAnalytics,
    OfferTrendPoint,
};
pub use get_offers::{GetOffersInput, GetOffersUseCase};
pub use update_offer::{UpdateOfferInput, UpdateOfferUseCase};

#[cfg(test)]
mod tests;
