use crate::http::container::Container;
use crate::use_cases::ids::uuid_generator;
use crate::use_cases::offers::{
    CompareOffersUseCase, CreateOfferUseCase, DeleteOfferUseCase, GetAllOffersUseCase,
    GetOfferAnalyticsUseCase, GetOffersUseCase, UpdateOfferUseCase,
};

impl Container {
    pub fn create_offer_use_case(&self) -> CreateOfferUseCase {
        CreateOfferUseCase {
            offer_repository: self.offer_repository.clone(),
            application_repository: self.application_repository.clone(),
            generate_offer_id: uuid_generator(),
        }
    }

    pub fn get_offers_use_case(&self) -> GetOffersUseCase {
        GetOffersUseCase {
            offer_repository: self.offer_repository.clone(),
            application_repository: self.application_repository.clone(),
        }
    }

    pub fn get_all_offers_use_case(&self) -> GetAllOffersUseCase {
        GetAllOffersUseCase {
            offer_repository: self.offer_repository.clone(),
            application_repository: self.application_repository.clone(),
        }
    }

    pub fn update_offer_use_case(&self) -> UpdateOfferUseCase {
        UpdateOfferUseCase {
            offer_repository: self.offer_repository.clone(),
            application_repository: self.application_repository.clone(),
        }
    }

    pub fn delete_offer_use_case(&self) -> DeleteOfferUseCase {
        DeleteOfferUseCase {
            offer_repository: self.offer_repository.clone(),
            application_repository: self.application_repository.clone(),
        }
    }

    pub fn compare_offers_use_case(&self) -> CompareOffersUseCase {
        CompareOffersUseCase {
            offer_repository: self.offer_repository.clone(),
            application_repository: self.application_repository.clone(),
        }
    }

    pub fn get_offer_analytics_use_case(&self) -> GetOfferAnalyticsUseCase {
        GetOfferAnalyticsUseCase {
            offer_repository: self.offer_repository.clone(),
            application_repository: self.application_repository.clone(),
        }
    }
}
